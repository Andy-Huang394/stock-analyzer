import React from 'react';
import { ArrowUpOutlined, ArrowDownOutlined, MinusOutlined } from '@ant-design/icons';
import '../styles/theme.css';

const monoStyle = {
  fontFamily: 'var(--font-mono)',
  fontVariantNumeric: 'tabular-nums'
};

/**
 * 涨跌显示组件（A 股：红涨绿跌；同时用箭头和正负号表达，不只靠颜色）
 */
const ChangeDisplay = ({ value, suffix = '%', showIcon = true, size = 'normal' }) => {
  const numValue = parseFloat(value);
  const fontSize = size === 'large' ? '18px' : size === 'small' ? '12px' : '14px';
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontSize,
    fontWeight: '500',
    ...monoStyle
  };

  if (numValue > 0) {
    return (
      <span className="up" style={base}>
        {showIcon && <ArrowUpOutlined aria-hidden="true" />}
        +{numValue.toFixed(2)}{suffix}
      </span>
    );
  } else if (numValue < 0) {
    return (
      <span className="down" style={base}>
        {showIcon && <ArrowDownOutlined aria-hidden="true" />}
        {numValue.toFixed(2)}{suffix}
      </span>
    );
  }

  return (
    <span className="flat" style={base}>
      {showIcon && <MinusOutlined aria-hidden="true" />}
      0.00{suffix}
    </span>
  );
};

/**
 * 评分徽章：状态圆点 + 等宽数字
 */
const ScoreBadge = ({ score, size = 'normal' }) => {
  const sizeMap = {
    small: { height: '22px', fontSize: '12px', minWidth: '40px' },
    normal: { height: '26px', fontSize: '13px', minWidth: '48px' },
    large: { height: '32px', fontSize: '16px', minWidth: '60px' }
  };
  const s = sizeMap[size] || sizeMap.normal;

  let level = 'low';
  let levelText = '低';
  if (score >= 70) { level = 'high'; levelText = '高'; }
  else if (score >= 50) { level = 'medium'; levelText = '中'; }

  return (
    <div
      className={`score-badge ${level}`}
      style={{ height: s.height, fontSize: s.fontSize, minWidth: s.minWidth }}
      title={`评分 ${Math.round(score)}（${levelText}）`}
      aria-label={`评分 ${Math.round(score)}，${levelText}`}
    >
      <span className="status-dot" aria-hidden="true" />
      {Math.round(score)}
    </div>
  );
};

/**
 * 概率条
 */
const ProbabilityBar = ({ probability, label }) => {
  const percentage = Math.round(probability * 100);
  let color = 'var(--danger-color)';
  if (percentage >= 70) color = 'var(--success-color)';
  else if (percentage >= 50) color = 'var(--accent)';
  else if (percentage >= 30) color = 'var(--warning-color)';

  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: '6px',
        fontSize: '12px'
      }}>
        <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
        <span style={{ color: 'var(--text-primary)', fontWeight: '500', ...monoStyle }}>
          {percentage}%
        </span>
      </div>
      <div
        className="progress-bar"
        role="progressbar"
        aria-valuenow={percentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className="progress-bar-fill"
          style={{ width: `${percentage}%`, background: color }}
        />
      </div>
    </div>
  );
};

/**
 * 卡片：1px 极弱边框，几乎无阴影
 */
const LuxuryCard = ({ children, title, subtitle, className = '', style = {}, headerAction = null }) => {
  return (
    <div className={`surface-card ${className}`} style={style}>
      {title && (
        <div className="surface-card__header">
          <div style={{ minWidth: 0 }}>
            <h3 className="surface-card__title">{title}</h3>
            {subtitle && <p className="surface-card__subtitle">{subtitle}</p>}
          </div>
          {headerAction && <div>{headerAction}</div>}
        </div>
      )}
      {children}
    </div>
  );
};

/**
 * 数据展示项
 */
const DataItem = ({ label, value, unit = '', change, trend, size = 'normal' }) => {
  const isLarge = size === 'large';

  return (
    <div style={{ textAlign: 'center' }}>
      <div className="data-label">{label}</div>

      <div
        className="data-value"
        style={{
          marginTop: '8px',
          fontSize: isLarge ? '28px' : '22px',
          color: trend === 'up' ? 'var(--up-color)' : trend === 'down' ? 'var(--down-color)' : 'var(--text-primary)'
        }}
      >
        {value}
        {unit && <span style={{
          fontSize: isLarge ? '14px' : '13px',
          marginLeft: '4px',
          color: 'var(--text-secondary)'
        }}>{unit}</span>}
      </div>

      {change !== undefined && (
        <div style={{ marginTop: '4px' }}>
          <ChangeDisplay value={change} size={isLarge ? 'normal' : 'small'} />
        </div>
      )}
    </div>
  );
};

/**
 * 指标卡片
 */
const MetricCard = ({ title, value, change, prefix = '', suffix = '', trend, icon = null }) => {
  return (
    <div className="surface-card" style={{ padding: '16px' }}>
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: '12px'
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: '12px',
            color: 'var(--text-secondary)',
            marginBottom: '8px'
          }}>
            {title}
          </div>

          <div style={{
            ...monoStyle,
            fontSize: '24px',
            fontWeight: '600',
            letterSpacing: '-0.01em',
            color: trend === 'up' ? 'var(--up-color)' : trend === 'down' ? 'var(--down-color)' : 'var(--text-primary)'
          }}>
            {prefix}<span className={trend === 'up' ? 'up' : trend === 'down' ? 'down' : ''}>{value}</span>
            {suffix && <span style={{ fontSize: '13px', color: 'var(--text-secondary)', marginLeft: '2px' }}>{suffix}</span>}
          </div>

          {change !== undefined && (
            <div style={{ marginTop: '4px' }}>
              <ChangeDisplay value={change} size="small" />
            </div>
          )}
        </div>

        {icon && (
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-secondary)',
            fontSize: '15px',
            flexShrink: 0
          }}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * 加载状态
 */
const LoadingState = ({ text = '数据加载中...' }) => {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '10px',
        padding: '48px 24px',
        color: 'var(--text-secondary)',
        fontSize: '13px'
      }}
    >
      <div className="loading-spinner" aria-hidden="true" />
      <span>{text}</span>
    </div>
  );
};

/**
 * 空状态
 */
const EmptyState = ({ title = '暂无数据', description = '' }) => {
  return (
    <div style={{
      textAlign: 'center',
      padding: '40px 24px',
      color: 'var(--text-secondary)'
    }}
    >
      <div style={{
        fontSize: '14px',
        fontWeight: 500,
        color: 'var(--text-primary)',
        marginBottom: '4px'
      }}>
        {title}
      </div>

      {description && (
        <div style={{ fontSize: '12px' }}>{description}</div>
      )}
    </div>
  );
};

/**
 * 标签：短标签 + 可选状态点
 */
const Tag = ({ children, variant = 'default', size = 'normal' }) => {
  const dotColors = {
    accent: 'var(--accent)',
    success: 'var(--success-color)',
    danger: 'var(--danger-color)',
    warning: 'var(--warning-color)'
  };

  const sizes = {
    small: { padding: '1px 6px', fontSize: '11px' },
    normal: { padding: '2px 8px', fontSize: '12px' },
    large: { padding: '4px 10px', fontSize: '13px' }
  };

  const s = sizes[size] || sizes.normal;
  const dot = dotColors[variant];

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      padding: s.padding,
      fontSize: s.fontSize,
      fontWeight: '500',
      borderRadius: '6px',
      background: 'var(--bg-tertiary)',
      color: 'var(--text-secondary)',
      border: '1px solid var(--border-color)'
    }}
    >
      {dot && <span className="status-dot" style={{ color: dot }} aria-hidden="true" />}
      {children}
    </span>
  );
};

// 向后兼容导出
const SciFiCard = LuxuryCard;
const SurfaceCard = LuxuryCard;

export {
  ChangeDisplay,
  ScoreBadge,
  ProbabilityBar,
  LuxuryCard,
  SurfaceCard,
  SciFiCard,
  MetricCard,
  DataItem,
  LoadingState,
  EmptyState,
  Tag
};
