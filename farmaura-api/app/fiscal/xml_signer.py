"""
farmaura-api/app/fiscal/xml_signer.py

XMLDSig enveloped signing for NF-e / NFC-e documents and events.

Responsibilities:
- sign `infNFe`, `infEvento` and `infInut` with the A1 certificate, following the NF-e signature profile;
- verify a signature (used as a mandatory self-check after signing, and by tests);

Observations:
- the NF-e schema pins `rsa-sha1` / `sha1` / C14N 1.0 inclusive; these are protocol requirements of the
  official XSD, not a design choice, and cannot be swapped for SHA-256 without SEFAZ rejecting the note;
- the signature is the last child of the signed element's parent (NFe: after `infNFeSupl`);
- after signing, the document is serialized, re-parsed and verified, so a canonicalization mismatch is
  caught here instead of as a SEFAZ rejection (cStat 297/298/…);
- the signed string must be stored and re-used verbatim; re-serializing it would invalidate the digest;
"""

from __future__ import annotations

import base64
import hashlib
from typing import cast

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from lxml import etree

from app.domain.fiscal import FiscalSignatureError
from app.fiscal.certificate import LoadedCertificate

DSIG_NS = "http://www.w3.org/2000/09/xmldsig#"
C14N_ALGORITHM = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315"
RSA_SHA1_ALGORITHM = "http://www.w3.org/2000/09/xmldsig#rsa-sha1"
SHA1_ALGORITHM = "http://www.w3.org/2000/09/xmldsig#sha1"
ENVELOPED_TRANSFORM = "http://www.w3.org/2000/09/xmldsig#enveloped-signature"

_SECURE_PARSER = etree.XMLParser(resolve_entities=False, no_network=True, huge_tree=False, remove_blank_text=False)


def _q(tag: str) -> str:
    return f"{{{DSIG_NS}}}{tag}"


def canonicalize(element: etree._Element) -> bytes:
    """Return the inclusive C14N 1.0 form of `element`, without comments."""

    return etree.tostring(element, method="c14n", exclusive=False, with_comments=False)


def parse_xml(xml: str | bytes) -> etree._Element:
    """Parse XML with entity resolution and network access disabled."""

    data = xml.encode("utf-8") if isinstance(xml, str) else xml
    return etree.fromstring(data, parser=_SECURE_PARSER)


# ============================================================================
# SIGNING
# ============================================================================


def sign_xml(xml: str | bytes, reference_tag: str, certificate: LoadedCertificate) -> str:
    """Sign the element named `reference_tag` (local name) and return the signed XML string.

    The element must carry an `Id` attribute; the resulting `Signature` is appended as the last child
    of that element's parent.
    """

    root = parse_xml(xml)
    referenced = _find_referenced(root, reference_tag)
    reference_id = referenced.get("Id")
    if not reference_id:
        raise FiscalSignatureError("O elemento a assinar não possui atributo Id.")
    parent = referenced.getparent()
    if parent is None:
        raise FiscalSignatureError("O elemento a assinar não possui elemento pai.")

    digest_value = base64.b64encode(hashlib.sha1(canonicalize(referenced)).digest()).decode("ascii")  # noqa: S324

    signature = etree.SubElement(parent, _q("Signature"), nsmap={None: DSIG_NS})  # type: ignore[dict-item]
    signed_info = etree.SubElement(signature, _q("SignedInfo"))
    etree.SubElement(signed_info, _q("CanonicalizationMethod"), Algorithm=C14N_ALGORITHM)
    etree.SubElement(signed_info, _q("SignatureMethod"), Algorithm=RSA_SHA1_ALGORITHM)
    reference = etree.SubElement(signed_info, _q("Reference"), URI=f"#{reference_id}")
    transforms = etree.SubElement(reference, _q("Transforms"))
    etree.SubElement(transforms, _q("Transform"), Algorithm=ENVELOPED_TRANSFORM)
    etree.SubElement(transforms, _q("Transform"), Algorithm=C14N_ALGORITHM)
    etree.SubElement(reference, _q("DigestMethod"), Algorithm=SHA1_ALGORITHM)
    etree.SubElement(reference, _q("DigestValue")).text = digest_value
    signature_value = etree.SubElement(signature, _q("SignatureValue"))
    key_info = etree.SubElement(signature, _q("KeyInfo"))
    x509_data = etree.SubElement(key_info, _q("X509Data"))
    etree.SubElement(x509_data, _q("X509Certificate")).text = certificate.certificate_der_base64()

    raw_signature = certificate.private_key.sign(canonicalize(signed_info), padding.PKCS1v15(), hashes.SHA1())  # noqa: S303
    signature_value.text = base64.b64encode(raw_signature).decode("ascii")

    signed_xml = etree.tostring(root, encoding="unicode")
    if not verify_signature(signed_xml, certificate):
        raise FiscalSignatureError("A assinatura gerada não passou na verificação interna.")
    return signed_xml


def _find_referenced(root: etree._Element, reference_tag: str) -> etree._Element:
    if etree.QName(root).localname == reference_tag:
        return root
    matches = [el for el in root.iter() if isinstance(el.tag, str) and etree.QName(el).localname == reference_tag]
    if len(matches) != 1:
        raise FiscalSignatureError(f"Esperado exatamente um elemento {reference_tag} para assinar.")
    return matches[0]


# ============================================================================
# VERIFICATION
# ============================================================================


def verify_signature(xml: str | bytes, certificate: LoadedCertificate | None = None) -> bool:
    """Verify the first enveloped signature in `xml` (digest and RSA value).

    When `certificate` is None the certificate embedded in `KeyInfo` is used.
    """

    root = parse_xml(xml)
    signature = root.find(f".//{_q('Signature')}")
    if signature is None:
        return False
    signed_info = signature.find(_q("SignedInfo"))
    reference = signed_info.find(_q("Reference")) if signed_info is not None else None
    signature_value = signature.findtext(_q("SignatureValue"))
    if signed_info is None or reference is None or not signature_value:
        return False
    uri = reference.get("URI", "")
    if not uri.startswith("#"):
        return False
    matches = cast(list[etree._Element], root.xpath(f"//*[@Id='{uri[1:]}']"))
    if len(matches) != 1:
        return False
    expected_digest = base64.b64encode(hashlib.sha1(canonicalize(matches[0])).digest()).decode("ascii")  # noqa: S324
    if expected_digest != (reference.findtext(_q("DigestValue")) or "").strip():
        return False
    if certificate is not None:
        public_key: object = certificate.certificate.public_key()
    else:
        cert_text = signature.findtext(f".//{_q('X509Certificate')}")
        if not cert_text:
            return False
        from cryptography import x509

        public_key = x509.load_der_x509_certificate(base64.b64decode(cert_text)).public_key()
    if not isinstance(public_key, rsa.RSAPublicKey):
        return False
    try:
        public_key.verify(
            base64.b64decode(signature_value),
            canonicalize(signed_info),
            padding.PKCS1v15(),
            hashes.SHA1(),  # noqa: S303
        )
    except (InvalidSignature, ValueError, TypeError):
        return False
    return True
