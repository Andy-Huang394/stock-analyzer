import React from 'react';
import { ArrowUpOutlined, ArrowDownOutlined, MinusOutlined } from '@ant-design/icons';
import '../styles/theme.css';

/**
 * 涨跌显示组件
 */
const ChangeDisplay = ({ value, suffix = '%', showIcon = true }) => {
  const numValue = parseFloat(value);
  
  if (numValue > 0) {
    return (
      <span className="up" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        {showIcon && <ArrowUpOutlined />}
        +{numValue.toFixed(2)}{suffix}
      </span>
    );
  } else if (numValue < 0) {
    return (
      <span className="down" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        {showIcon && <ArrowDownOutlined />}
        {numValue.toFixed(2)}{suffix}
      </span>
    );
  }
  
  return (
    <span style={{ color: 'var(--text-muted)' }}>
      {showIcon && <MinusOutlined />}
      0.00{suffix}
    </span>
  );
};

/**
 * 评分徽章 - 简洁风格
 */
const ScoreBadge = ({ score, size = 'normal' }) => {
  let className = 'score-badge low';
  if (score >= 70) className = 'score-badge high';
  else if (score >= 50) className = 'score-badge medium';
  
  return (
    <div className={className}>
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
  else if (percentage >= 50) color = 'var(--primary-color)';
  else if (percentage >= 30) color = 'var(--warning-color)';
  
  return (
    <div style={{ marginBottom: '8px' }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        marginBottom: '4px',
        fontSize: '12px'
      }}>
        <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
        <span style={{ color: color, fontWeight: 'bold' }}>{percentage}%</span>
      </div>
      <div className="progress-bar">
        <div 
          className="progress-bar-fill"
          style={{ 
            width: `${percentage}%`,
            background: color
          }} 
        />
      </div>
    </div>
  );
};

/**
 * 科幻卡片 - 简洁风格
 */
const SciFiCard = ({ children, title, className = '', style = {} }) => {
  return (
    <div className={`scifi-card ${className}`} style={style}>
      {title && (
        <div style={{ 
          marginBottom: '16px',
          paddingBottom: '12px',
          borderBottom: '1px solid var(--border-color)',
        }}>
          <h3 style={{ 
            margin: 0,
            fontSize: '16px',
            fontWeight: '600',
            color: 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span style={{ 
              width: '4px', 
              height: '16px', 
              background: 'var(--gradient-primary)',
              borderRadius: '2px'
            }}/>
            {title}
          </h3>
        </div>
      )}
      {children}
    </div>
  );
};

/**
 * 数据展示项
 */
const DataItem = ({ label, value, unit = '', change, trend }) => {
  return (
    <div style={{ textAlign: 'center' }}>
      <div className="data-label">{label}</div>
      <div className="data-value" style={{ marginTop: '8px' }}>
        {value}
        {unit && <span style={{ fontSize: '14px', marginLeft: '4px' }}>{unit}</span>}
      </div>
      {change !== undefined && (
        <div style={{ marginTop: '4px', fontSize: '12px' }}>
          <ChangeDisplay value={change} />
        </div>
      )}
    </div>
  );
};

/**
 * 加载状态 - 简洁
 */
const LoadingState = ({ text = '数据加载中...' }) => {
  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column',
      alignItems: 'center', 
      justifyContent: 'center',
      padding: '40px',
      color: 'var(--text-secondary)'
    }}>
      <div style={{ 
        width: '32px', 
        height: '32px', 
        border: '3px solid var(--border-color)',
        borderTopColor: 'var(--primary-color)',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite'
      }} />
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
      <span style={{ 
        marginTop: '16px',
        fontSize: '14px',
        color: 'var(--text-muted)'
      }}>{text}</span>
    </div>
  );
};

export { 
  ChangeDisplay, 
  ScoreBadge, 
  ProbabilityBar, 
  SciFiCard, 
  DataItem,
  LoadingState 
};
