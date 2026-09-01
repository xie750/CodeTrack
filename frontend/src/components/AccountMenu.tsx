import { Dropdown, type MenuProps } from "antd";
import { ChartNoAxesColumnIncreasing, ChevronDown, FolderOpen, LayoutDashboard, LogOut, UserRound } from "lucide-react";
import type { AuthUser } from "../authSession";

type AccountMenuItem = NonNullable<MenuProps["items"]>[number];

type AccountMenuProps = {
  authUser: AuthUser;
  leadingItems?: AccountMenuItem[];
  onLogout: () => void;
  onNavigate: (path: string) => void;
  onMenuSelect?: (key: string) => boolean | void;
};

function avatarInitial(user: AuthUser) {
  const source = (user.display_name || user.username || "").trim();
  const [firstChar] = Array.from(source);
  return firstChar?.toLocaleUpperCase("zh-CN") ?? "用";
}

function roleLabel(authUser: AuthUser) {
  if (authUser.role === "STUDENT") return "学生账号";
  if (authUser.role === "TEACHER") return "教师账号";
  return "账号";
}

function defaultMenuItems(authUser: AuthUser): AccountMenuItem[] {
  if (authUser.role === "STUDENT") {
    return [
      { key: "/self-study/profile", label: "学习者画像", icon: <ChartNoAxesColumnIncreasing size={16} strokeWidth={2.2} /> },
      { key: "/self-study/library", label: "资源中心", icon: <FolderOpen size={16} strokeWidth={2.2} /> },
      { key: "account", label: "账号信息", icon: <UserRound size={16} strokeWidth={2.2} />, disabled: true },
      { type: "divider" },
      { key: "logout", label: "退出登录", icon: <LogOut size={16} strokeWidth={2.2} />, danger: true }
    ];
  }

  return [
    { key: "/teacher/dashboard", label: "教学首页", icon: <LayoutDashboard size={16} strokeWidth={2.2} /> },
    { key: "/teacher/materials", label: "资料中心", icon: <FolderOpen size={16} strokeWidth={2.2} /> },
    { key: "account", label: "账号信息", icon: <UserRound size={16} strokeWidth={2.2} />, disabled: true },
    { type: "divider" },
    { key: "logout", label: "退出登录", icon: <LogOut size={16} strokeWidth={2.2} />, danger: true }
  ];
}

export default function AccountMenu({ authUser, leadingItems, onLogout, onNavigate, onMenuSelect }: AccountMenuProps) {
  const menuItems: MenuProps["items"] = leadingItems?.length
    ? [...leadingItems, { type: "divider" }, ...defaultMenuItems(authUser)]
    : defaultMenuItems(authUser);

  function handleMenuClick({ key }: { key: string }) {
    if (onMenuSelect?.(key)) return;
    if (key === "logout") {
      onLogout();
      return;
    }
    if (key.startsWith("/")) onNavigate(key);
  }

  return (
    <Dropdown menu={{ items: menuItems, onClick: handleMenuClick }} trigger={["click"]} placement="bottomRight" overlayClassName="account-dropdown-overlay">
      <button type="button" className="top-user account-trigger" aria-label={`${authUser.display_name}账号菜单`}>
        <span className="account-avatar" aria-hidden="true">{avatarInitial(authUser)}</span>
        <span className="account-trigger-copy">
          <strong>{authUser.display_name}</strong>
          <small>{roleLabel(authUser)}</small>
        </span>
        <ChevronDown className="account-chevron" size={16} strokeWidth={2.4} aria-hidden="true" />
      </button>
    </Dropdown>
  );
}
