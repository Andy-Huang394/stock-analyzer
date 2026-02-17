import React from 'react';
import { useMediaQuery } from 'react-responsive';
import { Button, Drawer, Menu } from 'antd';
import { MenuOutlined } from '@ant-design/icons';
import { Link, useLocation } from 'react-router-dom';

/**
 * 断点定义
 */
export const breakpoints = {
  xs: '(max-width: 575px)',
  sm: '(min-width: 576px) and (max-width: 767px)',
  md: '(min-width: 768px) and (max-width: 991px)',
  lg: '(min-width: 992px) and (max-width: 1199px)',
  xl: '(min-width: 1200px)'
};

/**
 * 响应式Hook
 */
export const useResponsive = () => {
  const isMobile = useMediaQuery({ query: breakpoints.xs });
  const isTablet = useMediaQuery({ query: breakpoints.sm });
  const isDesktop = useMediaQuery({ query: '(min-width: 768px)' });
  const isLargeDesktop = useMediaQuery({ query: '(min-width: 992px)' });

  return {
    isMobile,
    isTablet,
    isDesktop,
    isLargeDesktop,
    isSmallScreen: isMobile || isTablet
  };
};

/**
 * 移动端抽屉导航
 */
export const MobileNav = ({ visible, onClose }) => {
  const location = useLocation();

  const menuItems = [
    { key: '/', label: '市场概览', path: '/' },
    { key: '/analysis', label: '智能选股', path: '/analysis' },
    { key: '/strategy', label: '策略配置', path: '/strategy' }
  ];

  return (
    <Drawer
      title="Stock Analyzer"
      placement="left"
      onClose={onClose}
      open={visible}
      bodyStyle={{ padding: 0, background: 'var(--bg-secondary)' }}
      headerStyle={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }}
    >
      <Menu
        mode="inline"
        selectedKeys={[location.pathname]}
        style={{ 
          background: 'var(--bg-secondary)',
          borderRight: 'none'
        }}
        onClick={onClose}
        items={menuItems.map(item => ({
          key: item.key,
          label: <Link to={item.path}>{item.label}</Link>
        }))}
      />
    </Drawer>
  );
};

/**
 * 移动端菜单按钮
 */
export const MobileMenuButton = ({ onClick }) => (
  <Button
    type="text"
    icon={<MenuOutlined />}
    onClick={onClick}
    style={{ 
      color: 'var(--text-primary)',
      fontSize: '18px'
    }}
  />
);

/**
 * 响应式表格列
 * 根据屏幕大小返回不同的列配置
 */
export const getResponsiveColumns = (columns, isMobile) => {
  if (!isMobile) return columns;

  // 移动端隐藏部分列
  const mobileHidden = ['volume', 'up_probability_1d', 'up_probability_7d', 'signals'];
  return columns.filter(col => !mobileHidden.includes(col.key) && !mobileHidden.includes(col.dataIndex));
};

/**
 * 响应式容器
 * 根据屏幕大小调整内边距
 */
export const ResponsiveContainer = ({ children, style = {} }) => {
  const { isMobile } = useResponsive();

  return (
    <div
      style={{
        padding: isMobile ? '12px' : '24px',
        ...style
      }}
    >
      {children}
    </div>
  );
};

export default useResponsive;