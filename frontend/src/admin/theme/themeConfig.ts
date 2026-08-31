import type { ThemeConfig } from 'antd'

// CodeTrack 管理员端设计 Token —— 严格对齐「现代 · 专业 · 克制 · 数据驱动」
// 非中性色（主色 + 功能色）视觉占比 ≤15%，其余全部中性色阶
// 主色：科技蓝 #4A90D9 —— 全站唯一强调色
export const colors = {
  // 主色（品牌 / 操作 / 强调）
  primary: '#4A90D9',
  primaryHover: '#5DA3E5',
  primaryActive: '#3678C0',
  primaryDeep: '#2D68A8',
  primaryBg: '#E8F1FF',
  primaryBorder: '#B8D4F5',

  // 中性色阶
  bgPage: '#F4F7FC',
  bgSider: '#FAFBFC',
  bgCard: '#FFFFFF',
  bgHeader: '#FFFFFF',
  bgFill: '#F0F2F5',
  border: '#E8EDF2',
  borderWeak: '#C4CDD5',
  textPrimary: '#1D2C3C',
  textSecondary: '#5A6B7C',
  textMuted: '#A0B2C6',

  // 功能色（仅状态 / 提示 / 图表 / 预警）—— 红=危险 橙=警告 绿=成功 紫=图表维度 灰=信息
  success: '#5DC59F',
  warning: '#FFB54A',
  danger: '#F56C6C',
  info: '#A0B2C6',
  purple: '#A78BFA',

  // StatCard 图标底色调（5 种 tone）
  statIconBg: {
    primary: '#E8F1FF',
    info: '#F4F7FC',
    warning: '#FFF9F0',
    success: '#EDFAF5',
    purple: '#F6F0FF',
  },
} as const

const fontFamily =
  "'Inter Variable', 'MiSans', 'HarmonyOS Sans SC', 'PingFang SC', 'Noto Sans SC Variable', 'Noto Sans SC', 'Microsoft YaHei', system-ui, sans-serif"

export const themeConfig: ThemeConfig = {
  token: {
    colorPrimary: colors.primary,
    colorSuccess: colors.success,
    colorWarning: colors.warning,
    colorError: colors.danger,
    colorInfo: colors.info,
    colorTextBase: colors.textPrimary,
    colorText: colors.textPrimary,
    colorTextSecondary: colors.textSecondary,
    colorTextTertiary: colors.textMuted,
    colorBorder: colors.border,
    colorBorderSecondary: colors.bgFill,
    colorBgLayout: colors.bgPage,
    colorBgContainer: colors.bgCard,
    borderRadius: 8,
    borderRadiusLG: 16,
    fontSize: 14,
    controlHeight: 36,
    fontFamily,
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)',
    boxShadowSecondary: '0 4px 12px rgba(0, 0, 0, 0.06)',
  },
  components: {
    Layout: {
      headerBg: colors.bgHeader,
      headerHeight: 60,
      headerPadding: '0 24px',
      siderBg: colors.bgSider,
      bodyBg: colors.bgPage,
    },
    Menu: {
      itemBg: 'transparent',
      subMenuItemBg: 'transparent',
      itemSelectedBg: colors.primary,
      itemSelectedColor: '#ffffff',
      itemColor: colors.textSecondary,
      itemHoverBg: colors.primaryBg,
      itemHoverColor: colors.primary,
      itemBorderRadius: 8,
      itemMarginInline: 10,
      itemHeight: 40,
    },
    Card: {
      borderRadiusLG: 16,
      boxShadowTertiary: '0 1px 2px rgba(0, 0, 0, 0.03)',
    },
    Table: {
      headerBg: '#FAFBFC',
      headerColor: colors.textSecondary,
      headerSplitColor: colors.bgFill,
      rowHoverBg: '#E8F1FF',
      borderColor: colors.bgFill,
      borderRadiusLG: 8,
    },
    Tag: {
      borderRadius: 16,
    },
    Button: {
      borderRadius: 8,
      primaryShadow: 'none',
      defaultShadow: 'none',
    },
    Tabs: {
      itemSelectedColor: colors.primary,
      itemHoverColor: colors.primaryHover,
      inkBarColor: colors.primary,
    },
  },
}
