import React from 'react';
import { ArrowUpOutlined, ArrowDownOutlined, MinusOutlined, TrophyOutlined } from '@ant-design/icons';
import '../styles/theme.css';

/**
 * 涨跌显示组件 - 黑金风格
 */
const ChangeDisplay = ({ value, suffix = '%', showIcon = true, size = 'normal' }) => {
  const numValue = parseFloat(value);
  const fontSize = size === 'large' ? '18px' : size === 'small' ? '12px' : '14px';
  
  if (numValue > 0) {
    return (
      <span 
        className="up" 
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '4px',
          fontSize,
          fontFamily: 'var(--font-mono)',
          fontWeight: '600'
        }}
      >
        {showIcon && <ArrowUpOutlined />}
        +{numValue.toFixed(2)}{suffix}
      </span>
    );
  } else if (numValue < 0) {
    return (
      <span 
        className="down" 
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '4px',
          fontSize,
          fontFamily: 'var(--font-mono)',
          fontWeight: '600'
        }}
      >
        {showIcon && <ArrowDownOutlined />}
        {numValue.toFixed(2)}{suffix}
      </span>
    );
  }
  
  return (
    <span 
      style={{ 
        color: 'var(--text-muted)',
        fontSize,
        fontFamily: 'var(--font-mono)'
      }}
    >
      {showIcon && <MinusOutlined />}
      0.00{suffix}
    </span>
  );
};

/**
 * 评分徽章 - 奢华黑金风格
 */
const ScoreBadge = ({ score, size = 'normal' }) => {
  const sizeMap = {
    small: { width: '36px', height: '36px', fontSize: '12px' },
    normal: { width: '48px', height: '48px', fontSize: '14px' },
    large: { width: '64px', height: '64px', fontSize: '18px' }
  };
  const s = sizeMap[size] || sizeMap.normal;
  
  let className = 'score-badge low';
  if (score >= 70) className = 'score-badge high';
  else if (score >= 50) className = 'score-badge medium';
  
  return (
    <div 
      className={className}
      style={{
        width: s.width,
        height: s.height,
        fontSize: s.fontSize
      }}
    >
      {Math.round(score)}
    </div>
  );
};

/**
 * 概率条 - 金色渐变
 */
const ProbabilityBar = ({ probability, label }) => {
  const percentage = Math.round(probability * 100);
  let color = 'var(--danger-color)';
  if (percentage >= 70) color = 'var(--success-color)';
  else if (percentage >= 50) color = 'var(--gold-primary)';
  else if (percentage >= 30) color = 'var(--amber-primary)';
  
  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        marginBottom: '6px',
        fontSize: '12px'
      }}>
        <span style={{ 
          color: 'var(--text-secondary)',
          textTransform: 'uppercase',
          letterSpacing: '0.5px'
        }}>{label}</span>
        <span style={{ 
          color: color, 
          fontWeight: '600',
          fontFamily: 'var(--font-mono)'
        }}>{percentage}%</span>
      </div>
      <div className="progress-bar">
        <div 
          className="progress-bar-fill"
          style={{ 
            width: `${percentage}%`,
            background: percentage >= 70 ? 'var(--gradient-gold)' : color,
            boxShadow: percentage >= 70 ? '0 0 10px var(--gold-glow)' : `0 0 10px ${color}40`
          }} 
        />
      </div>
    </div>
  );
};

/**
 * 奢华卡片 - 黑金风格
 */
const LuxuryCard = ({ children, title, subtitle, className = '', style = {}, headerAction = null }) => {
  return (
    <div className={`luxury-card ${className}`} style={style}>
      {title && (
        <div style={{ 
          marginBottom: '20px',
          paddingBottom: '16px',
          borderBottom: '1px solid var(--border-gold)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div>
            <h3 style={{ 
              margin: 0,
              fontSize: '16px',
              fontWeight: '600',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-display)',
              letterSpacing: '0.5px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <span 
                className="text-gradient-gold"
                style={{ fontSize: '18px' }}
              >
                ◆
              </span>
              {title}
            </h3>
            {subtitle && (
              <p style={{
                margin: '4px 0 0',
                fontSize: '12px',
                color: 'var(--text-muted)'
              }}>
                {subtitle}
              </p>
            )}
          </div>
          {headerAction && (
            <div>{headerAction}</div>
          )}
        </div>
      )}
      {children}
    </div>
  );
};

/**
 * 数据展示项 - 金融风格
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
          fontSize: isLarge ? '32px' : '24px',
          color: trend === 'up' ? 'var(--up-color)' : trend === 'down' ? 'var(--down-color)' : 'var(--text-primary)'
        }}
      >
        {value}
        {unit && <span style={{ 
          fontSize: isLarge ? '16px' : '14px', 
          marginLeft: '4px',
          color: 'var(--text-secondary)'
        }}>{unit}</span>}
      </div>
      
      {change !== undefined && (
        <div style={{ marginTop: '6px' }}>
          <ChangeDisplay value={change} size={isLarge ? 'normal' : 'small'} />
        </div>
      )}
    </div>
  );
};

/**
 * 指标卡片 - 用于展示关键指标
 */
const MetricCard = ({ title, value, change, prefix = '', suffix = '', trend, icon = null }) => {
  return (
    <div className="luxury-card">
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between'
      }}>
        <div>
          <div style={{
            fontSize: '11px',
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '1.5px',
            marginBottom: '8px'
          }}>
            {title}
          </div>
          
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '28px',
            fontWeight: '600',
            color: trend === 'up' ? 'var(--up-color)' : trend === 'down' ? 'var(--down-color)' : 'var(--text-primary)'
          }}>
            {prefix}<span className={trend === 'up' ? 'up' : trend === 'down' ? 'down' : ''}>{value}</span>
            {suffix && <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>{suffix}</span>}
          </div>
          
          {change !== undefined && (
            <div style={{ marginTop: '6px' }}>
              <ChangeDisplay value={change} />
            </div>
          )}
        </div>
        
        {icon && (
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            background: 'rgba(212, 168, 83, 0.1)',
            border: '1px solid var(--border-gold)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--gold-primary)',
            fontSize: '18px'
          }}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * 加载状态 - 金色风格
 */
const LoadingState = ({ text = '数据加载中...' }) => {
  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column',
      alignItems: 'center', 
      justifyContent: 'center',
      padding: '48px',
      color: 'var(--text-secondary)'
    }}
    >
      <div className="loading-gold" style={{ width: '36px', height: '36px' }} />
      
      <span style={{ 
        marginTop: '20px',
        fontSize: '13px',
        color: 'var(--text-muted)',
        letterSpacing: '0.5px'
      }}>{text}</span>
    </div>
  );
};

/**
 * 空状态 - 黑金风格
 */
const EmptyState = ({ title = '暂无数据', description = '' }) => {
  return (
    <div style={{
      textAlign: 'center',
      padding: '48px 24px',
      color: 'var(--text-muted)'
    }}
    >
      <div style={{
        fontSize: '48px',
        marginBottom: '16px',
        opacity: 0.3
      }}>
        ◆
      </div>
      
      <div style={{
        fontSize: '16px',
        color: 'var(--text-secondary)',
        marginBottom: '8px',
        fontFamily: 'var(--font-display)'
      }}>
        {title}
      </div>
      
      {description && (
        <div style={{ fontSize: '13px' }}>{description}</div>
      )}
    </div>
  );
};

/**
 * 标签 - 黑金风格
 */
const Tag = ({ children, variant = 'default', size = 'normal' }) => {
  const variants = {
    default: {
      background: 'var(--bg-tertiary)',
      color: 'var(--text-secondary)',
      border: '1px solid var(--border-color)'
    },
    gold: {
      background: 'rgba(212, 168, 83, 0.1)',
      color: 'var(--gold-primary)',
      border: '1px solid var(--border-gold)'
    },
    success: {
      background: 'rgba(16, 185, 129, 0.1)',
      color: 'var(--success-color)',
      border: '1px solid rgba(16, 185, 129, 0.3)'
    },
    danger: {
      background: 'rgba(239, 68, 68, 0.1)',
      color: 'var(--danger-color)',
      border: '1px solid rgba(239, 68, 68, 0.3)'
    }
  };
  
  const sizes = {
    small: { padding: '2px 8px', fontSize: '11px' },
    normal: { padding: '4px 10px', fontSize: '12px' },
    large: { padding: '6px 14px', fontSize: '13px' }
  };
  
  const v = variants[variant] || variants.default;
  const s = sizes[size] || sizes.normal;
  
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      padding: s.padding,
      fontSize: s.fontSize,
      fontWeight: '500',
      borderRadius: '20px',
      ...v
    }}
    >
      {children}
    </span>
  );
};

// 向后兼容导出
const SciFiCard = LuxuryCard;

export { 
  ChangeDisplay, 
  ScoreBadge, 
  ProbabilityBar, 
  LuxuryCard,
  SciFiCard,
  MetricCard,
  DataItem,
  LoadingState,
  EmptyState,
  Tag
};
