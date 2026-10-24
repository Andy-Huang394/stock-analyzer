/**
 * Orca 风格调色板（JS 侧）。
 * 与 theme.css 中的 CSS 变量保持一致，供 antd ConfigProvider、ECharts、
 * lightweight-charts 等无法直接读取 CSS 变量的地方使用。
 * A 股习惯：红涨绿跌。
 */
import { theme as antdTheme } from 'antd';

export const palette = {
  bg: '#08090a',
  surface1: '#0e0f11',
  surface2: '#141517',
  surface3: '#1a1b1e',
  fg: '#f7f8f8',
  fgSecondary: '#8a8f98',
  fgMuted: '#7d828b',
  line: 'rgba(255, 255, 255, 0.08)',
  lineStrong: 'rgba(255, 255, 255, 0.14)',
  lineInput: 'rgba(255, 255, 255, 0.10)',
  accent: '#7c86ff',
  accentStrong: '#5e6ad2',
  accentSoft: 'rgba(124, 134, 255, 0.12)',
  success: '#30a46c',
  warning: '#d6a23a',
  danger: '#e5484d',
  up: '#e5484d',
  upSoft: 'rgba(229, 72, 77, 0.10)',
  down: '#30a46c',
  downSoft: 'rgba(48, 164, 108, 0.10)',
  flat: '#8a8f98',
  // 图表系列色：低饱和
  series: ['#8b93c9', '#c2a36b', '#6fa6a0', '#a68bb8', '#8a8f98'],
  ma5: '#c2a36b',
  ma10: '#8b93c9',
  ma20: '#a68bb8',
  ma60: '#6fa6a0',
  chartGrid: 'rgba(255, 255, 255, 0.05)',
  chartAxis: 'rgba(255, 255, 255, 0.10)',
  chartText: '#8a8f98',
};

export const fontSans =
  'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif';
export const fontMono =
  '"JetBrains Mono", "SF Mono", "Cascadia Code", Consolas, "Liberation Mono", "PingFang SC", "Microsoft YaHei", monospace';

/** 涨跌色：value > 0 红，< 0 绿，= 0 灰 */
export const trendColor = (value) => {
  const n = Number(value);
  if (n > 0) return palette.up;
  if (n < 0) return palette.down;
  return palette.flat;
};

/** 通用 ECharts tooltip 样式 */
export const echartsTooltip = {
  backgroundColor: palette.surface2,
  borderColor: palette.lineStrong,
  borderWidth: 1,
  padding: [8, 12],
  extraCssText: 'box-shadow: 0 8px 24px rgba(0,0,0,0.45); border-radius: 8px;',
  textStyle: { color: palette.fg, fontFamily: fontSans, fontSize: 12 },
};

/** antd ConfigProvider 主题 */
export const antdThemeConfig = {
  algorithm: antdTheme.darkAlgorithm,
  token: {
    colorPrimary: palette.accent,
    colorInfo: palette.accent,
    colorSuccess: palette.success,
    colorWarning: palette.warning,
    colorError: palette.danger,
    colorLink: palette.accent,
    colorBgBase: palette.bg,
    colorBgLayout: palette.bg,
    colorBgContainer: palette.surface1,
    colorBgElevated: palette.surface2,
    colorBgSpotlight: palette.surface3,
    colorTextBase: palette.fg,
    colorText: palette.fg,
    colorTextSecondary: palette.fgSecondary,
    colorTextTertiary: palette.fgMuted,
    colorTextQuaternary: '#5c6068',
    colorBorder: palette.lineInput,
    colorBorderSecondary: palette.line,
    colorSplit: palette.line,
    colorFillSecondary: palette.surface3,
    borderRadius: 8,
    borderRadiusLG: 12,
    borderRadiusSM: 6,
    fontFamily: fontSans,
    fontFamilyCode: fontMono,
    fontSize: 13,
    controlHeight: 34,
    controlHeightSM: 28,
    controlHeightLG: 38,
    lineWidth: 1,
    motionDurationFast: '0.12s',
    motionDurationMid: '0.15s',
    motionDurationSlow: '0.18s',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)',
    boxShadowSecondary: '0 8px 24px rgba(0, 0, 0, 0.45)',
    wireframe: false,
  },
  components: {
    Button: {
      // 主要按钮：浅色实心 + 深色文字
      colorPrimary: palette.fg,
      colorPrimaryHover: '#ffffff',
      colorPrimaryActive: '#d9dbdd',
      colorTextLightSolid: palette.bg,
      primaryShadow: 'none',
      defaultShadow: 'none',
      dangerShadow: 'none',
      defaultBg: 'transparent',
      defaultBorderColor: palette.lineInput,
      defaultColor: palette.fg,
      defaultHoverBg: palette.surface3,
      defaultHoverBorderColor: palette.lineStrong,
      defaultHoverColor: palette.fg,
      fontWeight: 500,
    },
    Layout: {
      bodyBg: palette.bg,
      headerBg: palette.bg,
      siderBg: palette.surface1,
    },
    Menu: {
      darkItemBg: 'transparent',
      darkSubMenuItemBg: 'transparent',
      darkItemColor: palette.fgSecondary,
      darkItemHoverColor: palette.fg,
      darkItemHoverBg: palette.surface2,
      darkItemSelectedBg: palette.surface3,
      darkItemSelectedColor: palette.fg,
      itemBorderRadius: 7,
    },
    Card: {
      colorBgContainer: palette.surface1,
      headerFontSize: 15,
    },
    Table: {
      headerBg: palette.surface2,
      headerColor: palette.fgSecondary,
      rowHoverBg: palette.surface2,
      borderColor: palette.line,
      headerSplitColor: palette.line,
    },
    Input: { activeShadow: '0 0 0 2px rgba(124, 134, 255, 0.25)' },
    InputNumber: { activeShadow: '0 0 0 2px rgba(124, 134, 255, 0.25)' },
    Select: {
      optionSelectedBg: palette.surface3,
      optionActiveBg: palette.surface2,
    },
    Tag: { defaultBg: palette.surface2, defaultColor: palette.fgSecondary },
    Tabs: { inkBarColor: palette.accent, itemSelectedColor: palette.fg, itemHoverColor: palette.fg },
    Segmented: { itemSelectedBg: palette.surface3, trackBg: palette.surface2 },
    Radio: {
      buttonSolidCheckedBg: palette.surface3,
      buttonSolidCheckedColor: palette.fg,
      buttonSolidCheckedHoverBg: palette.surface3,
      buttonSolidCheckedActiveBg: palette.surface3,
      buttonBg: 'transparent',
      buttonCheckedBg: palette.surface3,
      buttonColor: palette.fgSecondary,
    },
    Modal: { contentBg: palette.surface1, headerBg: palette.surface1 },
    Tooltip: { colorBgSpotlight: palette.surface3 },
    Progress: { remainingColor: palette.surface3 },
    Slider: {
      railBg: palette.surface3,
      railHoverBg: palette.surface3,
      trackBg: palette.accent,
      trackHoverBg: palette.accent,
      handleColor: palette.accent,
      handleActiveColor: palette.accent,
    },
    Statistic: { contentFontSize: 22 },
  },
};
