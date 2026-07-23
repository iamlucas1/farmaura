"""
farmaura-api/app/models/__init__.py

ORM model package for Farmaura.

Responsibilities:
- group SQLAlchemy models for the application;
- keep persistence entities explicit and typed;
- expose the model namespace for migrations and repositories;

Observations:
- all models inherit shared columns from app.models.base;
- table naming is explicit to support review and migrations;
"""

from app.models.audit_event import AuditEvent
from app.models.brand import Brand
from app.models.brand_supplier import BrandSupplier
from app.models.cart_item import CartItem
from app.models.cashback_rule import CashbackRule
from app.models.cashback_transaction import CashbackTransaction
from app.models.cashback_transaction_line import CashbackTransactionLine
from app.models.category import Category
from app.models.chat_message import ChatMessage
from app.models.chat_message_attachment import ChatMessageAttachment
from app.models.chat_thread import ChatThread
from app.models.coupon_campaign import CouponCampaign
from app.models.customer import Customer
from app.models.customer_address import CustomerAddress
from app.models.customer_cashback_wallet import CustomerCashbackWallet
from app.models.customer_payment_method import CustomerPaymentMethod
from app.models.delivery_route import DeliveryRoute
from app.models.delivery_route_stop import DeliveryRouteStop
from app.models.driver_location import DriverLocation
from app.models.file_asset import FileAsset
from app.models.fiscal_document import FiscalDocument
from app.models.health_service import HealthService
from app.models.health_service_appointment import HealthServiceAppointment
from app.models.inventory_audit_entry import InventoryAuditEntry
from app.models.inventory_invoice_record import InventoryInvoiceRecord
from app.models.inventory_item import InventoryItem
from app.models.inventory_location import InventoryLocation
from app.models.inventory_lot_movement import InventoryLotMovement
from app.models.inventory_movement import InventoryMovement
from app.models.inventory_product import InventoryProduct
from app.models.inventory_stock_lot import InventoryStockLot
from app.models.marketplace_listing import MarketplaceListing
from app.models.order import Order
from app.models.order_fulfillment import OrderFulfillment
from app.models.order_item import OrderItem
from app.models.order_status_event import OrderStatusEvent
from app.models.payment_webhook_event import PaymentWebhookEvent
from app.models.pdv_draft_session import PdvDraftSession
from app.models.pdv_order import PdvOrder
from app.models.pdv_order_item import PdvOrderItem
from app.models.pdv_sale import PdvSale
from app.models.pdv_sale_item import PdvSaleItem
from app.models.portal_setting import PortalSetting
from app.models.prescription import Prescription
from app.models.prescription_check import PrescriptionCheck
from app.models.prescription_file import PrescriptionFile
from app.models.prescription_item import PrescriptionItem
from app.models.pricing_promotion import PricingPromotion
from app.models.product_availability_alert import ProductAvailabilityAlert
from app.models.product_review import ProductReview
from app.models.purchase_quote import PurchaseQuote
from app.models.purchase_quote_item import PurchaseQuoteItem
from app.models.purchase_quote_payment_term import PurchaseQuotePaymentTerm
from app.models.refresh_token import RefreshToken
from app.models.saved_product import SavedProduct
from app.models.store import Store
from app.models.subscription import Subscription
from app.models.supplier import Supplier
from app.models.therapeutic_class import TherapeuticClass
from app.models.user import User

__all__ = [
    "AuditEvent",
    "Brand",
    "BrandSupplier",
    "CartItem",
    "CashbackRule",
    "CashbackTransaction",
    "CashbackTransactionLine",
    "Category",
    "CouponCampaign",
    "ChatMessage",
    "ChatMessageAttachment",
    "ChatThread",
    "Customer",
    "CustomerAddress",
    "CustomerCashbackWallet",
    "CustomerPaymentMethod",
    "DeliveryRoute",
    "DeliveryRouteStop",
    "DriverLocation",
    "FileAsset",
    "FiscalDocument",
    "HealthService",
    "HealthServiceAppointment",
    "InventoryAuditEntry",
    "InventoryInvoiceRecord",
    "InventoryItem",
    "InventoryLocation",
    "InventoryLotMovement",
    "InventoryMovement",
    "InventoryProduct",
    "InventoryStockLot",
    "MarketplaceListing",
    "Order",
    "OrderFulfillment",
    "OrderItem",
    "OrderStatusEvent",
    "PdvDraftSession",
    "PdvOrder",
    "PdvOrderItem",
    "PdvSale",
    "PdvSaleItem",
    "PaymentWebhookEvent",
    "PortalSetting",
    "PricingPromotion",
    "ProductAvailabilityAlert",
    "Prescription",
    "PrescriptionCheck",
    "PrescriptionFile",
    "PrescriptionItem",
    "ProductReview",
    "PurchaseQuote",
    "PurchaseQuoteItem",
    "PurchaseQuotePaymentTerm",
    "RefreshToken",
    "SavedProduct",
    "Store",
    "Subscription",
    "Supplier",
    "TherapeuticClass",
    "User",
]
