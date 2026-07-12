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
from app.models.cashback_rule import CashbackRule
from app.models.cashback_transaction import CashbackTransaction
from app.models.cashback_transaction_line import CashbackTransactionLine
from app.models.coupon_campaign import CouponCampaign
from app.models.chat_message import ChatMessage
from app.models.chat_message_attachment import ChatMessageAttachment
from app.models.chat_thread import ChatThread
from app.models.customer import Customer
from app.models.customer_address import CustomerAddress
from app.models.customer_cashback_wallet import CustomerCashbackWallet
from app.models.customer_payment_method import CustomerPaymentMethod
from app.models.delivery_route import DeliveryRoute
from app.models.delivery_route_stop import DeliveryRouteStop
from app.models.file_asset import FileAsset
from app.models.fiscal_document import FiscalDocument
from app.models.health_service import HealthService
from app.models.health_service_appointment import HealthServiceAppointment
from app.models.inventory_item import InventoryItem
from app.models.inventory_location import InventoryLocation
from app.models.inventory_movement import InventoryMovement
from app.models.marketplace_listing import MarketplaceListing
from app.models.order import Order
from app.models.order_fulfillment import OrderFulfillment
from app.models.order_item import OrderItem
from app.models.order_status_event import OrderStatusEvent
from app.models.pdv_order import PdvOrder
from app.models.pdv_order_item import PdvOrderItem
from app.models.pdv_sale import PdvSale
from app.models.pdv_sale_item import PdvSaleItem
from app.models.portal_setting import PortalSetting
from app.models.prescription import Prescription
from app.models.prescription_check import PrescriptionCheck
from app.models.prescription_file import PrescriptionFile
from app.models.prescription_item import PrescriptionItem
from app.models.product import Product
from app.models.product_review import ProductReview
from app.models.refresh_token import RefreshToken
from app.models.saved_product import SavedProduct
from app.models.cart_item import CartItem
from app.models.subscription import Subscription
from app.models.user import User

__all__ = [
    "AuditEvent",
    "CartItem",
    "CashbackRule",
    "CashbackTransaction",
    "CashbackTransactionLine",
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
    "FileAsset",
    "FiscalDocument",
    "HealthService",
    "HealthServiceAppointment",
    "InventoryItem",
    "InventoryLocation",
    "InventoryMovement",
    "MarketplaceListing",
    "Order",
    "OrderFulfillment",
    "OrderItem",
    "OrderStatusEvent",
    "PdvOrder",
    "PdvOrderItem",
    "PdvSale",
    "PdvSaleItem",
    "PortalSetting",
    "Prescription",
    "PrescriptionCheck",
    "PrescriptionFile",
    "PrescriptionItem",
    "Product",
    "ProductReview",
    "RefreshToken",
    "SavedProduct",
    "Subscription",
    "User",
]
