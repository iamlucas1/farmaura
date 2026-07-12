"""
farmaura-api/app/core/row_level_security.py

PostgreSQL row-level security bootstrap for tenant-scoped Farmaura tables.

Responsibilities:
- create the app_private helper functions RLS policies rely on;
- enable, force, and (re)install tenant and ownership-aware RLS policies;
- run idempotently on every backend startup, not just once via a migration.

Observations:
- this module replaces the raw SQL that used to live in one-shot Alembic
  migrations; the dev-phase policy in claude.md forbids creating migrations
  during this phase, so schema and RLS must both be reachable from the same
  bootstrap entrypoint (see scripts/bootstrap_database.py);
- every CREATE POLICY statement here is preceded by a DROP POLICY IF EXISTS
  for the same policy name so the whole set can be re-applied safely on
  every container start, not only against a freshly created database;
- app/core/tenant_context.py sets the app.current_tenant_id,
  app.current_user_id, app.current_user_role, and app.current_login_email
  session variables these policies and helper functions read from.
"""

from sqlalchemy import Connection


# ============================================================================
# RLS STATEMENTS
# ============================================================================


RLS_STATEMENTS: tuple[str, ...] = (
    """
    CREATE SCHEMA IF NOT EXISTS app_private
    """,
    """
    CREATE OR REPLACE FUNCTION app_private.current_tenant_id()
            RETURNS text
            LANGUAGE sql
            STABLE
            AS $$
                SELECT NULLIF(current_setting('app.current_tenant_id', true), '')
            $$;
    """,
    """
    CREATE OR REPLACE FUNCTION app_private.current_user_role()
            RETURNS text
            LANGUAGE sql
            STABLE
            AS $$
                SELECT NULLIF(current_setting('app.current_user_role', true), '')
            $$;
    """,
    """
    DO $$
            DECLARE
                table_name text;
                tenant_tables text[] := ARRAY[
                    'audit_events',
                    'cashback_rules',
                    'cashback_transactions',
                    'chat_threads',
                    'customers',
                    'delivery_routes',
                    'file_assets',
                    'fiscal_documents',
                    'health_service_appointments',
                    'health_services',
                    'inventory_items',
                    'marketplace_listings',
                    'orders',
                    'pdv_orders',
                    'pdv_sales',
                    'prescriptions',
                    'products',
                    'saved_products',
                    'subscriptions',
                    'users'
                ];
            BEGIN
                FOREACH table_name IN ARRAY tenant_tables
                LOOP
                    EXECUTE format('ALTER TABLE %%I ENABLE ROW LEVEL SECURITY', table_name);
                    EXECUTE format('ALTER TABLE %%I FORCE ROW LEVEL SECURITY', table_name);
                    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_policy ON %%I', table_name);
                    EXECUTE format(
                        'CREATE POLICY tenant_isolation_policy ON %%I USING (tenant_id = app_private.current_tenant_id()) WITH CHECK (tenant_id = app_private.current_tenant_id())',
                        table_name
                    );
                END LOOP;
            END $$;
    """,
    """
    CREATE OR REPLACE FUNCTION app_private.current_user_id()
            RETURNS uuid
            LANGUAGE sql
            STABLE
            AS $$
                SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid
            $$;
    """,
    """
    CREATE OR REPLACE FUNCTION app_private.current_login_email()
            RETURNS text
            LANGUAGE sql
            STABLE
            AS $$
                SELECT lower(NULLIF(current_setting('app.current_login_email', true), ''))
            $$;
    """,
    """
    CREATE OR REPLACE FUNCTION app_private.current_webhook_payment_id()
            RETURNS text
            LANGUAGE sql
            STABLE
            AS $$
                SELECT NULLIF(current_setting('app.current_webhook_payment_id', true), '')
            $$;
    """,
    """
    CREATE OR REPLACE FUNCTION app_private.is_admin()
            RETURNS boolean
            LANGUAGE sql
            STABLE
            AS $$
                SELECT app_private.current_user_role() = 'admin'
            $$;
    """,
    """
    CREATE OR REPLACE FUNCTION app_private.is_pharmacist()
            RETURNS boolean
            LANGUAGE sql
            STABLE
            AS $$
                SELECT app_private.current_user_role() = 'pharmacist'
            $$;
    """,
    """
    CREATE OR REPLACE FUNCTION app_private.is_cashier()
            RETURNS boolean
            LANGUAGE sql
            STABLE
            AS $$
                SELECT app_private.current_user_role() = 'cashier'
            $$;
    """,
    """
    CREATE OR REPLACE FUNCTION app_private.is_internal_operator()
            RETURNS boolean
            LANGUAGE sql
            STABLE
            AS $$
                SELECT app_private.current_user_role() IN ('admin', 'pharmacist', 'cashier')
            $$;
    """,
    """
    CREATE OR REPLACE FUNCTION app_private.can_access_customer_row(target_customer_id uuid)
            RETURNS boolean
            LANGUAGE sql
            STABLE
            AS $$
                SELECT
                    app_private.current_tenant_id() IS NOT NULL
                    AND (
                        target_customer_id = app_private.current_user_id()
                        OR app_private.current_user_role() IN ('admin', 'pharmacist')
                    )
            $$;
    """,
    """
    DROP FUNCTION IF EXISTS app_private.can_access_order_row(text);
    CREATE OR REPLACE FUNCTION app_private.can_access_order_row(target_customer_id uuid)
            RETURNS boolean
            LANGUAGE sql
            STABLE
            AS $$
                SELECT
                    app_private.current_tenant_id() IS NOT NULL
                    AND (
                        target_customer_id = app_private.current_user_id()
                        OR app_private.current_user_role() IN ('admin', 'pharmacist')
                    )
            $$;
    """,
    """
    CREATE OR REPLACE FUNCTION app_private.can_access_file_asset_row(target_owner_user_id text)
            RETURNS boolean
            LANGUAGE sql
            STABLE
            AS $$
                SELECT
                    app_private.current_tenant_id() IS NOT NULL
                    AND (
                        target_owner_user_id = app_private.current_user_id()::text
                        OR app_private.current_user_role() IN ('admin', 'pharmacist')
                    )
            $$;
    """,
    """
    CREATE OR REPLACE FUNCTION app_private.can_access_prescription_row(target_customer_id uuid, target_reviewer_user_id uuid)
            RETURNS boolean
            LANGUAGE sql
            STABLE
            AS $$
                SELECT
                    app_private.current_tenant_id() IS NOT NULL
                    AND (
                        target_customer_id = app_private.current_user_id()
                        OR target_reviewer_user_id = app_private.current_user_id()
                        OR app_private.current_user_role() IN ('admin', 'pharmacist')
                    )
            $$;
    """,
    """
    CREATE OR REPLACE FUNCTION app_private.can_access_chat_thread_row(target_customer_id uuid, target_pharmacist_user_id uuid)
            RETURNS boolean
            LANGUAGE sql
            STABLE
            AS $$
                SELECT
                    app_private.current_tenant_id() IS NOT NULL
                    AND (
                        target_customer_id = app_private.current_user_id()
                        OR target_pharmacist_user_id = app_private.current_user_id()
                        OR app_private.current_user_role() IN ('admin', 'pharmacist')
                    )
            $$;
    """,
    """
    DROP POLICY IF EXISTS tenant_isolation_policy ON users
    """,
    """
    DROP POLICY IF EXISTS users_access_policy ON users;
    CREATE POLICY users_access_policy
            ON users
            USING (
                lower(email) = app_private.current_login_email()
                OR (
                    tenant_id = app_private.current_tenant_id()
                    AND (
                        id = app_private.current_user_id()
                        OR app_private.current_user_role() IN ('admin', 'pharmacist')
                    )
                )
            )
            WITH CHECK (
                tenant_id = app_private.current_tenant_id()
                AND (
                    id = app_private.current_user_id()
                    OR app_private.current_user_role() IN ('admin', 'pharmacist')
                )
            )
    """,
    """
    DROP POLICY IF EXISTS tenant_isolation_policy ON customers
    """,
    """
    DROP POLICY IF EXISTS customers_access_policy ON customers;
    CREATE POLICY customers_access_policy
            ON customers
            USING (
                tenant_id = app_private.current_tenant_id()
                AND app_private.can_access_customer_row(id)
            )
            WITH CHECK (
                tenant_id = app_private.current_tenant_id()
                AND app_private.can_access_customer_row(id)
            )
    """,
    """
    DROP POLICY IF EXISTS tenant_isolation_policy ON orders
    """,
    """
    DROP POLICY IF EXISTS orders_access_policy ON orders;
    CREATE POLICY orders_access_policy
            ON orders
            USING (
                (
                    tenant_id = app_private.current_tenant_id()
                    AND app_private.can_access_order_row(customer_id)
                )
                OR gateway_payment_id = app_private.current_webhook_payment_id()
            )
            WITH CHECK (
                (
                    tenant_id = app_private.current_tenant_id()
                    AND app_private.can_access_order_row(customer_id)
                )
                OR gateway_payment_id = app_private.current_webhook_payment_id()
            )
    """,
    """
    DROP POLICY IF EXISTS tenant_isolation_policy ON file_assets
    """,
    """
    DROP POLICY IF EXISTS file_assets_access_policy ON file_assets;
    CREATE POLICY file_assets_access_policy
            ON file_assets
            USING (
                tenant_id = app_private.current_tenant_id()
                AND app_private.can_access_file_asset_row(owner_user_id)
            )
            WITH CHECK (
                tenant_id = app_private.current_tenant_id()
                AND app_private.can_access_file_asset_row(owner_user_id)
            )
    """,
    """
    DROP POLICY IF EXISTS tenant_isolation_policy ON prescriptions
    """,
    """
    DROP POLICY IF EXISTS prescriptions_access_policy ON prescriptions;
    CREATE POLICY prescriptions_access_policy
            ON prescriptions
            USING (
                tenant_id = app_private.current_tenant_id()
                AND app_private.can_access_prescription_row(customer_id, reviewed_by_user_id)
            )
            WITH CHECK (
                tenant_id = app_private.current_tenant_id()
                AND app_private.can_access_prescription_row(customer_id, reviewed_by_user_id)
            )
    """,
    """
    DROP POLICY IF EXISTS tenant_isolation_policy ON chat_threads
    """,
    """
    DROP POLICY IF EXISTS chat_threads_access_policy ON chat_threads;
    CREATE POLICY chat_threads_access_policy
            ON chat_threads
            USING (
                tenant_id = app_private.current_tenant_id()
                AND app_private.can_access_chat_thread_row(customer_id, pharmacist_user_id)
            )
            WITH CHECK (
                tenant_id = app_private.current_tenant_id()
                AND app_private.can_access_chat_thread_row(customer_id, pharmacist_user_id)
            )
    """,
    """
    DROP POLICY IF EXISTS tenant_isolation_policy ON products
    """,
    """
    DROP POLICY IF EXISTS products_access_policy ON products;
    CREATE POLICY products_access_policy
            ON products
            USING (
                tenant_id = app_private.current_tenant_id()
                AND (
                    app_private.current_user_role() = 'customer'
                    OR app_private.current_user_role() IN ('admin', 'pharmacist')
                )
            )
            WITH CHECK (
                tenant_id = app_private.current_tenant_id()
                AND app_private.current_user_role() IN ('admin', 'pharmacist')
            )
    """,
    """
    DROP POLICY IF EXISTS tenant_isolation_policy ON inventory_items
    """,
    """
    DROP POLICY IF EXISTS inventory_items_access_policy ON inventory_items;
    CREATE POLICY inventory_items_access_policy
            ON inventory_items
            USING (
                tenant_id = app_private.current_tenant_id()
                AND app_private.current_user_role() IN ('admin', 'pharmacist')
            )
            WITH CHECK (
                tenant_id = app_private.current_tenant_id()
                AND app_private.current_user_role() IN ('admin', 'pharmacist')
            )
    """,
    """
    DROP POLICY IF EXISTS tenant_isolation_policy ON marketplace_listings
    """,
    """
    DROP POLICY IF EXISTS marketplace_listings_access_policy ON marketplace_listings;
    CREATE POLICY marketplace_listings_access_policy
            ON marketplace_listings
            USING (
                tenant_id = app_private.current_tenant_id()
                AND (
                    app_private.current_user_role() = 'customer'
                    OR app_private.current_user_role() IN ('admin', 'pharmacist')
                )
            )
            WITH CHECK (
                tenant_id = app_private.current_tenant_id()
                AND app_private.current_user_role() IN ('admin', 'pharmacist')
            )
    """,
    """
    DROP POLICY IF EXISTS tenant_isolation_policy ON pdv_orders
    """,
    """
    DROP POLICY IF EXISTS pdv_orders_access_policy ON pdv_orders;
    CREATE POLICY pdv_orders_access_policy
            ON pdv_orders
            USING (
                tenant_id = app_private.current_tenant_id()
                AND (
                    app_private.current_user_role() IN ('admin', 'pharmacist')
                    OR (
                        app_private.current_user_role() = 'cashier'
                        AND (
                            cashier_user_id = app_private.current_user_id()
                            OR cashier_user_id IS NULL
                        )
                    )
                )
            )
            WITH CHECK (
                tenant_id = app_private.current_tenant_id()
                AND (
                    app_private.current_user_role() IN ('admin', 'pharmacist')
                    OR (
                        app_private.current_user_role() = 'cashier'
                        AND (
                            cashier_user_id = app_private.current_user_id()
                            OR cashier_user_id IS NULL
                        )
                    )
                )
            )
    """,
    """
    DROP POLICY IF EXISTS tenant_isolation_policy ON pdv_sales
    """,
    """
    DROP POLICY IF EXISTS pdv_sales_access_policy ON pdv_sales;
    CREATE POLICY pdv_sales_access_policy
            ON pdv_sales
            USING (
                tenant_id = app_private.current_tenant_id()
                AND (
                    app_private.current_user_role() IN ('admin', 'pharmacist')
                    OR (
                        app_private.current_user_role() = 'cashier'
                        AND cashier_user_id = app_private.current_user_id()
                    )
                )
            )
            WITH CHECK (
                tenant_id = app_private.current_tenant_id()
                AND (
                    app_private.current_user_role() IN ('admin', 'pharmacist')
                    OR (
                        app_private.current_user_role() = 'cashier'
                        AND cashier_user_id = app_private.current_user_id()
                    )
                )
            )
    """,
    """
    DROP POLICY IF EXISTS tenant_isolation_policy ON saved_products
    """,
    """
    DROP POLICY IF EXISTS saved_products_access_policy ON saved_products;
    CREATE POLICY saved_products_access_policy
            ON saved_products
            USING (
                tenant_id = app_private.current_tenant_id()
                AND app_private.can_access_customer_row(customer_id)
            )
            WITH CHECK (
                tenant_id = app_private.current_tenant_id()
                AND app_private.can_access_customer_row(customer_id)
            )
    """,
    """
    DROP POLICY IF EXISTS tenant_isolation_policy ON health_services
    """,
    """
    DROP POLICY IF EXISTS health_services_access_policy ON health_services;
    CREATE POLICY health_services_access_policy
            ON health_services
            USING (
                tenant_id = app_private.current_tenant_id()
                AND (
                    app_private.current_user_role() = 'customer'
                    OR app_private.current_user_role() IN ('admin', 'pharmacist')
                )
            )
            WITH CHECK (
                tenant_id = app_private.current_tenant_id()
                AND app_private.current_user_role() IN ('admin', 'pharmacist')
            )
    """,
    """
    DROP POLICY IF EXISTS tenant_isolation_policy ON subscriptions
    """,
    """
    DROP POLICY IF EXISTS subscriptions_access_policy ON subscriptions;
    CREATE POLICY subscriptions_access_policy
            ON subscriptions
            USING (
                tenant_id = app_private.current_tenant_id()
                AND app_private.can_access_customer_row(customer_id)
            )
            WITH CHECK (
                tenant_id = app_private.current_tenant_id()
                AND app_private.can_access_customer_row(customer_id)
            )
    """,
    """
    DROP POLICY IF EXISTS tenant_isolation_policy ON health_service_appointments
    """,
    """
    DROP POLICY IF EXISTS health_service_appointments_access_policy ON health_service_appointments;
    CREATE POLICY health_service_appointments_access_policy
            ON health_service_appointments
            USING (
                tenant_id = app_private.current_tenant_id()
                AND (
                    app_private.can_access_customer_row(customer_id)
                    OR assigned_user_id = app_private.current_user_id()
                )
            )
            WITH CHECK (
                tenant_id = app_private.current_tenant_id()
                AND (
                    app_private.can_access_customer_row(customer_id)
                    OR assigned_user_id = app_private.current_user_id()
                )
            )
    """,
    """
    ALTER TABLE customer_addresses ENABLE ROW LEVEL SECURITY;
            ALTER TABLE customer_addresses FORCE ROW LEVEL SECURITY;
            DROP POLICY IF EXISTS customer_addresses_access_policy ON customer_addresses;
            CREATE POLICY customer_addresses_access_policy
            ON customer_addresses
            USING (
                EXISTS (
                    SELECT 1
                    FROM customers
                    WHERE customers.id = customer_addresses.customer_id
                      AND customers.tenant_id = app_private.current_tenant_id()
                      AND app_private.can_access_customer_row(customers.id)
                )
            )
            WITH CHECK (
                EXISTS (
                    SELECT 1
                    FROM customers
                    WHERE customers.id = customer_addresses.customer_id
                      AND customers.tenant_id = app_private.current_tenant_id()
                      AND app_private.can_access_customer_row(customers.id)
                )
            );
    """,
    """
    ALTER TABLE customer_payment_methods ENABLE ROW LEVEL SECURITY;
            ALTER TABLE customer_payment_methods FORCE ROW LEVEL SECURITY;
            DROP POLICY IF EXISTS customer_payment_methods_access_policy ON customer_payment_methods;
            CREATE POLICY customer_payment_methods_access_policy
            ON customer_payment_methods
            USING (
                EXISTS (
                    SELECT 1
                    FROM customers
                    WHERE customers.id = customer_payment_methods.customer_id
                      AND customers.tenant_id = app_private.current_tenant_id()
                      AND app_private.can_access_customer_row(customers.id)
                )
            )
            WITH CHECK (
                EXISTS (
                    SELECT 1
                    FROM customers
                    WHERE customers.id = customer_payment_methods.customer_id
                      AND customers.tenant_id = app_private.current_tenant_id()
                      AND app_private.can_access_customer_row(customers.id)
                )
            );
    """,
    """
    ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
            ALTER TABLE order_items FORCE ROW LEVEL SECURITY;
            DROP POLICY IF EXISTS order_items_access_policy ON order_items;
            CREATE POLICY order_items_access_policy
            ON order_items
            USING (
                EXISTS (
                    SELECT 1
                    FROM orders
                    WHERE orders.id = order_items.order_id
                      AND orders.tenant_id = app_private.current_tenant_id()
                      AND app_private.can_access_order_row(orders.customer_id)
                )
            )
            WITH CHECK (
                EXISTS (
                    SELECT 1
                    FROM orders
                    WHERE orders.id = order_items.order_id
                      AND orders.tenant_id = app_private.current_tenant_id()
                      AND app_private.can_access_order_row(orders.customer_id)
                )
            );
    """,
    """
    ALTER TABLE pdv_order_items ENABLE ROW LEVEL SECURITY;
            ALTER TABLE pdv_order_items FORCE ROW LEVEL SECURITY;
            DROP POLICY IF EXISTS pdv_order_items_access_policy ON pdv_order_items;
            CREATE POLICY pdv_order_items_access_policy
            ON pdv_order_items
            USING (
                EXISTS (
                    SELECT 1
                    FROM pdv_orders
                    WHERE pdv_orders.id = pdv_order_items.pdv_order_id
                      AND pdv_orders.tenant_id = app_private.current_tenant_id()
                      AND (
                        app_private.current_user_role() IN ('admin', 'pharmacist')
                        OR (
                            app_private.current_user_role() = 'cashier'
                            AND (
                                pdv_orders.cashier_user_id = app_private.current_user_id()
                                OR pdv_orders.cashier_user_id IS NULL
                            )
                        )
                      )
                )
            )
            WITH CHECK (
                EXISTS (
                    SELECT 1
                    FROM pdv_orders
                    WHERE pdv_orders.id = pdv_order_items.pdv_order_id
                      AND pdv_orders.tenant_id = app_private.current_tenant_id()
                      AND (
                        app_private.current_user_role() IN ('admin', 'pharmacist')
                        OR (
                            app_private.current_user_role() = 'cashier'
                            AND (
                                pdv_orders.cashier_user_id = app_private.current_user_id()
                                OR pdv_orders.cashier_user_id IS NULL
                            )
                        )
                      )
                )
            );
    """,
    """
    ALTER TABLE pdv_sale_items ENABLE ROW LEVEL SECURITY;
            ALTER TABLE pdv_sale_items FORCE ROW LEVEL SECURITY;
            DROP POLICY IF EXISTS pdv_sale_items_access_policy ON pdv_sale_items;
            CREATE POLICY pdv_sale_items_access_policy
            ON pdv_sale_items
            USING (
                EXISTS (
                    SELECT 1
                    FROM pdv_sales
                    WHERE pdv_sales.id = pdv_sale_items.pdv_sale_id
                      AND pdv_sales.tenant_id = app_private.current_tenant_id()
                      AND (
                        app_private.current_user_role() IN ('admin', 'pharmacist')
                        OR (
                            app_private.current_user_role() = 'cashier'
                            AND pdv_sales.cashier_user_id = app_private.current_user_id()
                        )
                      )
                )
            )
            WITH CHECK (
                EXISTS (
                    SELECT 1
                    FROM pdv_sales
                    WHERE pdv_sales.id = pdv_sale_items.pdv_sale_id
                      AND pdv_sales.tenant_id = app_private.current_tenant_id()
                      AND (
                        app_private.current_user_role() IN ('admin', 'pharmacist')
                        OR (
                            app_private.current_user_role() = 'cashier'
                            AND pdv_sales.cashier_user_id = app_private.current_user_id()
                        )
                      )
                )
            );
    """,
    """
    ALTER TABLE order_fulfillments ENABLE ROW LEVEL SECURITY;
            ALTER TABLE order_fulfillments FORCE ROW LEVEL SECURITY;
            DROP POLICY IF EXISTS order_fulfillments_access_policy ON order_fulfillments;
            CREATE POLICY order_fulfillments_access_policy
            ON order_fulfillments
            USING (
                EXISTS (
                    SELECT 1
                    FROM orders
                    WHERE orders.id = order_fulfillments.order_id
                      AND orders.tenant_id = app_private.current_tenant_id()
                      AND app_private.can_access_order_row(orders.customer_id)
                )
            )
            WITH CHECK (
                EXISTS (
                    SELECT 1
                    FROM orders
                    WHERE orders.id = order_fulfillments.order_id
                      AND orders.tenant_id = app_private.current_tenant_id()
                      AND app_private.can_access_order_row(orders.customer_id)
                )
            );
    """,
    """
    ALTER TABLE order_status_events ENABLE ROW LEVEL SECURITY;
            ALTER TABLE order_status_events FORCE ROW LEVEL SECURITY;
            DROP POLICY IF EXISTS order_status_events_access_policy ON order_status_events;
            CREATE POLICY order_status_events_access_policy
            ON order_status_events
            USING (
                EXISTS (
                    SELECT 1
                    FROM orders
                    WHERE orders.id = order_status_events.order_id
                      AND orders.tenant_id = app_private.current_tenant_id()
                      AND app_private.can_access_order_row(orders.customer_id)
                )
            )
            WITH CHECK (
                EXISTS (
                    SELECT 1
                    FROM orders
                    WHERE orders.id = order_status_events.order_id
                      AND orders.tenant_id = app_private.current_tenant_id()
                      AND app_private.can_access_order_row(orders.customer_id)
                )
            );
    """,
    """
    ALTER TABLE prescription_files ENABLE ROW LEVEL SECURITY;
            ALTER TABLE prescription_files FORCE ROW LEVEL SECURITY;
            DROP POLICY IF EXISTS prescription_files_access_policy ON prescription_files;
            CREATE POLICY prescription_files_access_policy
            ON prescription_files
            USING (
                EXISTS (
                    SELECT 1
                    FROM prescriptions
                    WHERE prescriptions.id = prescription_files.prescription_id
                      AND prescriptions.tenant_id = app_private.current_tenant_id()
                      AND app_private.can_access_prescription_row(
                        prescriptions.customer_id,
                        prescriptions.reviewed_by_user_id
                      )
                )
            )
            WITH CHECK (
                EXISTS (
                    SELECT 1
                    FROM prescriptions
                    WHERE prescriptions.id = prescription_files.prescription_id
                      AND prescriptions.tenant_id = app_private.current_tenant_id()
                      AND app_private.can_access_prescription_row(
                        prescriptions.customer_id,
                        prescriptions.reviewed_by_user_id
                      )
                )
            );
    """,
    """
    ALTER TABLE prescription_items ENABLE ROW LEVEL SECURITY;
            ALTER TABLE prescription_items FORCE ROW LEVEL SECURITY;
            DROP POLICY IF EXISTS prescription_items_access_policy ON prescription_items;
            CREATE POLICY prescription_items_access_policy
            ON prescription_items
            USING (
                EXISTS (
                    SELECT 1
                    FROM prescriptions
                    WHERE prescriptions.id = prescription_items.prescription_id
                      AND prescriptions.tenant_id = app_private.current_tenant_id()
                      AND app_private.can_access_prescription_row(
                        prescriptions.customer_id,
                        prescriptions.reviewed_by_user_id
                      )
                )
            )
            WITH CHECK (
                EXISTS (
                    SELECT 1
                    FROM prescriptions
                    WHERE prescriptions.id = prescription_items.prescription_id
                      AND prescriptions.tenant_id = app_private.current_tenant_id()
                      AND app_private.can_access_prescription_row(
                        prescriptions.customer_id,
                        prescriptions.reviewed_by_user_id
                      )
                )
            );
    """,
    """
    ALTER TABLE prescription_checks ENABLE ROW LEVEL SECURITY;
            ALTER TABLE prescription_checks FORCE ROW LEVEL SECURITY;
            DROP POLICY IF EXISTS prescription_checks_access_policy ON prescription_checks;
            CREATE POLICY prescription_checks_access_policy
            ON prescription_checks
            USING (
                EXISTS (
                    SELECT 1
                    FROM prescriptions
                    WHERE prescriptions.id = prescription_checks.prescription_id
                      AND prescriptions.tenant_id = app_private.current_tenant_id()
                      AND (
                        prescriptions.reviewed_by_user_id = app_private.current_user_id()
                        OR app_private.current_user_role() IN ('admin', 'pharmacist')
                      )
                )
            )
            WITH CHECK (
                EXISTS (
                    SELECT 1
                    FROM prescriptions
                    WHERE prescriptions.id = prescription_checks.prescription_id
                      AND prescriptions.tenant_id = app_private.current_tenant_id()
                      AND (
                        prescriptions.reviewed_by_user_id = app_private.current_user_id()
                        OR app_private.current_user_role() IN ('admin', 'pharmacist')
                      )
                )
            );
    """,
    """
    ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
            ALTER TABLE chat_messages FORCE ROW LEVEL SECURITY;
            DROP POLICY IF EXISTS chat_messages_access_policy ON chat_messages;
            CREATE POLICY chat_messages_access_policy
            ON chat_messages
            USING (
                EXISTS (
                    SELECT 1
                    FROM chat_threads
                    WHERE chat_threads.id = chat_messages.thread_id
                      AND chat_threads.tenant_id = app_private.current_tenant_id()
                      AND app_private.can_access_chat_thread_row(
                        chat_threads.customer_id,
                        chat_threads.pharmacist_user_id
                      )
                      AND (
                        app_private.current_user_role() IN ('admin', 'pharmacist')
                        OR chat_messages.is_internal_note IS FALSE
                      )
                )
            )
            WITH CHECK (
                EXISTS (
                    SELECT 1
                    FROM chat_threads
                    WHERE chat_threads.id = chat_messages.thread_id
                      AND chat_threads.tenant_id = app_private.current_tenant_id()
                      AND app_private.can_access_chat_thread_row(
                        chat_threads.customer_id,
                        chat_threads.pharmacist_user_id
                      )
                      AND (
                        app_private.current_user_role() IN ('admin', 'pharmacist')
                        OR chat_messages.is_internal_note IS FALSE
                      )
                )
            );
    """,
    """
    ALTER TABLE chat_message_attachments ENABLE ROW LEVEL SECURITY;
            ALTER TABLE chat_message_attachments FORCE ROW LEVEL SECURITY;
            DROP POLICY IF EXISTS chat_message_attachments_access_policy ON chat_message_attachments;
            CREATE POLICY chat_message_attachments_access_policy
            ON chat_message_attachments
            USING (
                EXISTS (
                    SELECT 1
                    FROM chat_messages
                    JOIN chat_threads ON chat_threads.id = chat_messages.thread_id
                    WHERE chat_messages.id = chat_message_attachments.message_id
                      AND chat_threads.tenant_id = app_private.current_tenant_id()
                      AND app_private.can_access_chat_thread_row(
                        chat_threads.customer_id,
                        chat_threads.pharmacist_user_id
                      )
                      AND (
                        app_private.current_user_role() IN ('admin', 'pharmacist')
                        OR chat_messages.is_internal_note IS FALSE
                      )
                )
            )
            WITH CHECK (
                EXISTS (
                    SELECT 1
                    FROM chat_messages
                    JOIN chat_threads ON chat_threads.id = chat_messages.thread_id
                    WHERE chat_messages.id = chat_message_attachments.message_id
                      AND chat_threads.tenant_id = app_private.current_tenant_id()
                      AND app_private.can_access_chat_thread_row(
                        chat_threads.customer_id,
                        chat_threads.pharmacist_user_id
                      )
                      AND (
                        app_private.current_user_role() IN ('admin', 'pharmacist')
                        OR chat_messages.is_internal_note IS FALSE
                      )
                )
            );
    """,
    """
    ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;
            ALTER TABLE refresh_tokens FORCE ROW LEVEL SECURITY;
            DROP POLICY IF EXISTS refresh_tokens_access_policy ON refresh_tokens;
            CREATE POLICY refresh_tokens_access_policy
            ON refresh_tokens
            USING (
                user_id = app_private.current_user_id()::text
                OR app_private.is_admin()
            )
            WITH CHECK (
                user_id = app_private.current_user_id()::text
                OR app_private.is_admin()
            );
    """,
    """
    ALTER TABLE inventory_locations ENABLE ROW LEVEL SECURITY
    """,
    """
    ALTER TABLE inventory_locations FORCE ROW LEVEL SECURITY
    """,
    """
    DROP POLICY IF EXISTS inventory_locations_access_policy ON inventory_locations;
    CREATE POLICY inventory_locations_access_policy
            ON inventory_locations
            USING (
                tenant_id = app_private.current_tenant_id()
                AND app_private.current_user_role() IN ('admin', 'pharmacist')
            )
            WITH CHECK (
                tenant_id = app_private.current_tenant_id()
                AND app_private.current_user_role() IN ('admin', 'pharmacist')
            )
    """,
    """
    ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY
    """,
    """
    ALTER TABLE inventory_movements FORCE ROW LEVEL SECURITY
    """,
    """
    DROP POLICY IF EXISTS inventory_movements_access_policy ON inventory_movements;
    CREATE POLICY inventory_movements_access_policy
            ON inventory_movements
            USING (
                tenant_id = app_private.current_tenant_id()
                AND app_private.current_user_role() IN ('admin', 'pharmacist')
            )
            WITH CHECK (
                tenant_id = app_private.current_tenant_id()
                AND app_private.current_user_role() IN ('admin', 'pharmacist')
            )
    """,
    """
    ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY
    """,
    """
    ALTER TABLE cart_items FORCE ROW LEVEL SECURITY
    """,
    """
    DROP POLICY IF EXISTS cart_items_access_policy ON cart_items;
    CREATE POLICY cart_items_access_policy
            ON cart_items
            USING (
                tenant_id = app_private.current_tenant_id()
                AND app_private.can_access_customer_row(customer_id)
            )
            WITH CHECK (
                tenant_id = app_private.current_tenant_id()
                AND app_private.can_access_customer_row(customer_id)
            )
    """,
)


# ============================================================================
# APPLICATION
# ============================================================================


def apply_row_level_security(connection: Connection) -> None:
    """Create RLS helper functions and (re)install every tenant/ownership policy."""

    for statement in RLS_STATEMENTS:
        connection.exec_driver_sql(statement)
