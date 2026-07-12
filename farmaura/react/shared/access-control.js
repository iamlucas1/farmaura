/*
shared/access-control.js

Shared frontend access-control helpers for Farmaura portals.

Responsibilities:
- normalize authenticated users for marketplace and internal apps;
- centralize role, scope, and route authorization rules;

Observations:
- this file is framework-agnostic and attaches helpers to window;
*/

(function attachAccessControl(globalObject) {
  const ROLE = {
    ADMIN: 'admin',
    PHARMACIST: 'pharmacist',
    CASHIER: 'cashier',
    CUSTOMER: 'customer',
  };

  const ACCESS_SCOPE = {
    MARKETPLACE: 'marketplace',
    INTERNAL: 'internal',
    HYBRID: 'hybrid',
  };

  const INTERNAL_ROUTE_ACCESS = {
    [ROLE.ADMIN]: ['dash', 'pdv', 'orders', 'deliveries', 'rx', 'chat', 'crm', 'sales', 'analytics', 'inventory', 'pricing', 'coupons'],
    [ROLE.PHARMACIST]: ['dash', 'pdv', 'orders', 'deliveries', 'rx', 'chat', 'crm', 'analytics', 'inventory', 'pricing', 'coupons'],
    [ROLE.CASHIER]: ['dash', 'pdv', 'sales'],
    [ROLE.CUSTOMER]: [],
  };

  const INTERNAL_ROLE_LABEL = {
    [ROLE.ADMIN]: 'Administrador',
    [ROLE.PHARMACIST]: 'Farmacêutico',
    [ROLE.CASHIER]: 'Caixa',
    [ROLE.CUSTOMER]: 'Cliente',
  };

  function buildAvatarLabel(name) {
    return String(name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'FA';
  }

  function createUser(overrides) {
    const source = overrides || {};
    return {
      id: source.id || String(Date.now()),
      name: source.name || '',
      email: source.email || '',
      role: source.role || ROLE.CUSTOMER,
      accessScope: source.accessScope || ACCESS_SCOPE.MARKETPLACE,
      store: source.store || null,
      crf: source.crf || null,
      avatar: source.avatar || '',
      twoFactorEnabled: !!source.twoFactorEnabled,
    };
  }

  function createUserFromSession(sessionResponse) {
    const source = sessionResponse || {};
    const subject = source.subject || {};
    return createUser({
      id: subject.user_id || '',
      name: source.full_name || '',
      email: source.email || '',
      role: subject.role || ROLE.CUSTOMER,
      accessScope: subject.access_scope || ACCESS_SCOPE.MARKETPLACE,
      avatar: buildAvatarLabel(source.full_name || source.email || ''),
      twoFactorEnabled: !!source.two_factor_enabled,
    });
  }

  function normalizeMarketplaceUser(user) {
    if (!user) {
      return null;
    }
    return createUser({
      ...user,
      role: user.role || ROLE.CUSTOMER,
      accessScope: user.accessScope || ACCESS_SCOPE.MARKETPLACE,
    });
  }

  function normalizeInternalUser(user) {
    if (!user) {
      return null;
    }
    return createUser({
      ...user,
      role: user.role || ROLE.PHARMACIST,
      accessScope: user.accessScope || ACCESS_SCOPE.INTERNAL,
    });
  }

  function canAccessMarketplace(user) {
    return !!user && user.role === ROLE.CUSTOMER && user.accessScope === ACCESS_SCOPE.MARKETPLACE;
  }

  function canAccessInternal(user) {
    return !!user && [ROLE.ADMIN, ROLE.PHARMACIST, ROLE.CASHIER].includes(user.role)
      && [ACCESS_SCOPE.INTERNAL, ACCESS_SCOPE.HYBRID].includes(user.accessScope);
  }

  function isInternalPortalEligible(user) {
    if (!canAccessInternal(user)) {
      return false;
    }
    return getVisibleInternalRoutes(user).length > 0;
  }

  function canAccessInternalRoute(user, route) {
    if (!isInternalPortalEligible(user)) {
      return false;
    }
    return (INTERNAL_ROUTE_ACCESS[user.role] || []).includes(route);
  }

  function getFirstInternalRoute(user) {
    const routes = INTERNAL_ROUTE_ACCESS[user && user.role ? user.role : ROLE.CUSTOMER] || [];
    return routes[0] || 'dash';
  }

  function getVisibleInternalRoutes(user) {
    return [...(INTERNAL_ROUTE_ACCESS[user && user.role ? user.role : ROLE.CUSTOMER] || [])];
  }

  globalObject.FA_ACCESS = {
    ACCESS_SCOPE,
    ROLE,
    INTERNAL_ROLE_LABEL,
    buildAvatarLabel,
    canAccessInternal,
    canAccessInternalRoute,
    canAccessMarketplace,
    createUserFromSession,
    getFirstInternalRoute,
    getVisibleInternalRoutes,
    isInternalPortalEligible,
    normalizeInternalUser,
    normalizeMarketplaceUser,
  };
})(window);
