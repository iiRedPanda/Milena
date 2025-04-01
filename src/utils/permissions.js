function hasPermission(member, config, requiredRoleType) {
    const roles = config[requiredRoleType];
    return roles.some(roleId => member.roles.cache.has(roleId));
}

module.exports = { hasPermission };
