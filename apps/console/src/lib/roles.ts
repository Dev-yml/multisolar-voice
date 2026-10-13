export const ROLES = ["SUPER_ADMIN", "SALES_ADMIN", "SALES_EXECUTIVE", "SUPPORT"] as const;
export type RoleValue = (typeof ROLES)[number];

export const ROLE_LABELS: Record<RoleValue, string> = {
  SUPER_ADMIN: "Super Admin",
  SALES_ADMIN: "Sales Admin",
  SALES_EXECUTIVE: "Sales Executive",
  SUPPORT: "Support",
};

/** Who may change prices, subsidy rules, knowledge and agent settings. */
export const MANAGERS: RoleValue[] = ["SUPER_ADMIN", "SALES_ADMIN"];
/** Who may manage users. */
export const ADMINS: RoleValue[] = ["SUPER_ADMIN"];
/** Who may work leads and escalations. */
export const SALES: RoleValue[] = ["SUPER_ADMIN", "SALES_ADMIN", "SALES_EXECUTIVE"];
