import React, { useState } from 'react';
import { Layout, Menu, Typography, Row, Col, Button } from 'antd';
import { 
  DashboardOutlined, 
  LineChartOutlined, 
  SettingOutlined,
  StarOutlined,
  BellOutlined,
  MenuOutlined,
  MoneyCollectOutlined,
  FireOutlined,
  PieChartOutlined,
  ArrowLeftOutlined,
  DatabaseOutlined
} from '@ant-design/icons';
import { BrowserRouter as Router, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import MarketOverview from './components/MarketOverview';
import AnalysisResults from './components/AnalysisResults';
import StrategyConfig from './components/StrategyConfig';
import Watchlist from './components/Watchlist';
import PriceAlert from './components/PriceAlert';
import StockChart from './components/StockChart';
import StockChartPro from './components/StockChartPro';
import StockSearch from './components/StockSearch';
import FundFlow from './components/FundFlow';
import SectorHeat from './components/SectorHeat';
import Portfolio from './components/Portfolio';
import DataManager from './components/DataManager';
import './styles/theme.css';

const { Header, Content, Sider } = Layout;
const { Title } = Typography;

/**
 * 导航菜单
 */
const Navigation = () => {
  const location = useLocation();
  
  const menuItems = [
    {
      key: '/',
      icon: <DashboardOutlined />,
      label: <Link to="/">市场概览</Link>,
    },
    {
      key: '/analysis',
      icon: <LineChartOutlined />,
      label: <Link to="/analysis">智能选股</Link>,
    },
    {
      key: '/fundflow',
      icon: <MoneyCollectOutlined />,
      label: <Link to="/fundflow">资金流向</Link>,
    },
    {
      key: '/sectors',
      icon: <FireOutlined />,
      label: <Link to="/sectors">板块热点</Link>,
    },
    {
      key: '/portfolio',
      icon: <PieChartOutlined />,
      label: <Link to="/portfolio">投资组合</Link>,
    },
    {
      key: '/watchlist',
      icon: <StarOutlined />,
      label: <Link to="/watchlist">自选股</Link>,
    },
    {
      key: '/alerts',
      icon: <BellOutlined />,
      label: <Link to="/alerts">价格预警</Link>,
    },
    {
      key: '/data',
      icon: <DatabaseOutlined />,
      label: <Link to="/data">数据管理</Link>,
    },
    {
      key: '/strategy',
      icon: <SettingOutlined />,
      label: <Link to="/strategy">策略配置</Link>,
    },
  ];

  return (
    <Menu
      theme="dark"
      mode="inline"
      selectedKeys={[location.pathname]}
      items={menuItems}
      style={{ 
        background: 'transparent',
        borderRight: 'none',
        padding: '8px 0',
        fontSize: '13px'
      }}
    />
  );
};

/**
 * 品牌标识：小方块 + 文字，不使用装饰性图标或渐变
 */
const BrandMark = () => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    color: 'var(--text-primary)',
    fontSize: '14px',
    fontWeight: 600,
    letterSpacing: '-0.01em'
  }}>
    <span aria-hidden="true" style={{
      width: '18px',
      height: '18px',
      borderRadius: '5px',
      background: 'var(--text-primary)',
      color: 'var(--bg-base)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <LineChartOutlined style={{ fontSize: '11px' }} />
    </span>
    Stock Analyzer
  </div>
);

const PAGE_TITLES = {
  '/': '市场概览',
  '/analysis': '智能选股分析',
  '/fundflow': '资金流向分析',
  '/sectors': '板块热点追踪',
  '/portfolio': '投资组合分析',
  '/watchlist': '自选股管理',
  '/alerts': '价格预警',
  '/data': '数据管理',
  '/strategy': '策略参数配置'
};

const getPageTitle = (pathname) => {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  if (pathname.startsWith('/stock/')) return '个股详情';
  if (pathname.startsWith('/chart/')) return '专业图表';
  return 'Stock Analyzer';
};

/**
 * 内容区页面标题（Orca：28px / 700 / 轻微负字距）
 */
const PageTitle = ({ compact = false }) => {
  const location = useLocation();
  return (
    <h1
      className="page-title"
      style={{
        marginBottom: compact ? '16px' : '24px',
        fontSize: compact ? '22px' : '28px'
      }}
    >
      {getPageTitle(location.pathname)}
    </h1>
  );
};

/**
 * 顶栏：搜索 + 时间
 */
const PageHeader = () => {
  const navigate = useNavigate();

  return (
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'space-between',
      padding: '0 24px',
      width: '100%',
      gap: '16px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
        <div style={{ maxWidth: '320px', width: '100%' }}>
          <StockSearch 
            size="small"
            placeholder="搜索股票代码或名称"
            onSelect={(symbol, name) => {
              navigate(`/stock/${symbol}`);
            }}
          />
        </div>
      </div>
      
      <div className="num" style={{ 
        fontSize: '12px',
        color: 'var(--text-secondary)',
        whiteSpace: 'nowrap'
      }}>
        {new Date().toLocaleString('zh-CN', {
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        })}
      </div>
    </div>
  );
};

/**
 * 自选股页面
 */
const WatchlistPage = () => {
  const navigate = useNavigate();
  
  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={16}>
        <Watchlist onSelectStock={(stock) => navigate(`/stock/${stock.symbol}`)} />
      </Col>
      <Col xs={24} lg={8}>
        <PriceAlert />
      </Col>
    </Row>
  );
};

/**
 * 预警页面
 */
const AlertsPage = () => (
  <Row gutter={[16, 16]}>
    <Col xs={24} lg={16}>
      <PriceAlert />
    </Col>
    <Col xs={24} lg={8}>
      <Watchlist />
    </Col>
  </Row>
);

/**
 * 股票详情页面
 */
const StockDetailPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const symbol = location.pathname.split('/').pop();
  
  return (
    <div>
      {/* 返回按钮 */}
      <div style={{ 
        marginBottom: '16px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
      }}>
        <Button 
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate(-1)}
        >
          返回
        </Button>
        <span style={{ 
          color: 'var(--text-secondary)',
          fontSize: '13px'
        }}>
          <span className="num" style={{ color: 'var(--text-primary)' }}>{symbol}</span> 详情
        </span>
      </div>
      
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <StockChart symbol={symbol} />
        </Col>
        <Col xs={24} lg={8}>
          <PriceAlert symbol={symbol} />
          <div style={{ marginTop: '16px' }}>
            <Watchlist />
          </div>
        </Col>
      </Row>
    </div>
  );
};

/**
 * 专业K线图表页面
 */
const StockChartProPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const symbol = location.pathname.split('/').pop();
  
  return (
    <div>
      <div style={{ 
        marginBottom: '16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Button 
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(-1)}
          >
            返回
          </Button>
          <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
            <span className="num" style={{ color: 'var(--text-primary)' }}>{symbol}</span> 专业图表
          </span>
        </div>
        
        <Button 
          type="primary"
          onClick={() => navigate(`/stock/${symbol}`)}
        >
          标准视图
        </Button>
      </div>
      
      <StockChartPro symbol={symbol} height={600} />
    </div>
  );
};

/**
 * 仪表盘首页
 */
const Dashboard = () => (
  <div>
    <MarketOverview />
    <AnalysisResults />
  </div>
);

/**
 * 移动端布局 - 抽屉导航
 */
const MobileLayout = ({ children }) => {
  const [drawerVisible, setDrawerVisible] = useState(false);
  const location = useLocation();
  
  const menuItems = [
    { key: '/', icon: <DashboardOutlined />, label: '市场概览' },
    { key: '/analysis', icon: <LineChartOutlined />, label: '智能选股' },
    { key: '/fundflow', icon: <MoneyCollectOutlined />, label: '资金流向' },
    { key: '/sectors', icon: <FireOutlined />, label: '板块热点' },
    { key: '/portfolio', icon: <PieChartOutlined />, label: '投资组合' },
    { key: '/watchlist', icon: <StarOutlined />, label: '自选股' },
    { key: '/alerts', icon: <BellOutlined />, label: '价格预警' },
    { key: '/data', icon: <DatabaseOutlined />, label: '数据管理' },
    { key: '/strategy', icon: <SettingOutlined />, label: '策略配置' },
  ];

  return (
    <Layout style={{ minHeight: '100vh', background: 'transparent' }}>
      <Sider
        trigger={null}
        collapsible
        collapsed={true}
        collapsedWidth={0}
        width={0}
        style={{ display: 'none' }}
      />
      
      <Layout style={{ background: 'transparent' }}>
        <Header style={{
          background: 'var(--bg-base)',
          borderBottom: '1px solid var(--border-color)',
          padding: '0 12px',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          height: '52px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Button
              type="text"
              aria-label="打开导航菜单"
              icon={<MenuOutlined style={{ fontSize: '16px' }} />}
              onClick={() => setDrawerVisible(true)}
              style={{ color: 'var(--text-secondary)' }}
            />
            <Title level={4} style={{ 
              margin: 0, 
              color: 'var(--text-primary)',
              fontSize: '14px',
              fontWeight: 600
            }}>
              Stock Analyzer
            </Title>
          </div>
        </Header>

        {/* 移动端抽屉菜单 */}
        {drawerVisible && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 999,
              display: 'flex'
            }}
            onClick={() => setDrawerVisible(false)}
          >
            <div 
              style={{
                width: '240px',
                height: '100%',
                background: 'var(--bg-secondary)',
                borderRight: '1px solid var(--border-color)',
                paddingTop: '16px'
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ 
                padding: '0 16px 16px',
                borderBottom: '1px solid var(--border-color)',
                marginBottom: '8px'
              }}>
                <BrandMark />
              </div>
              
              <Menu
                theme="dark"
                mode="inline"
                selectedKeys={[location.pathname]}
                style={{ background: 'transparent', borderRight: 'none' }}
                items={menuItems.map(item => ({
                  key: item.key,
                  icon: item.icon,
                  label: <Link to={item.key} onClick={() => setDrawerVisible(false)}>{item.label}</Link>
                }))}
              />
            </div>
            <div style={{ flex: 1, background: 'rgba(0,0,0,0.6)' }}></div>
          </div>
        )}

        <Content style={{ 
          padding: '16px 14px 32px',
          background: 'transparent',
          minHeight: 'calc(100vh - 52px)'
        }}>
          <PageTitle compact />
          {children}
        </Content>
      </Layout>
    </Layout>
  );
};

/**
 * 桌面端布局
 */
const DesktopLayout = ({ children }) => (
  <Layout style={{ minHeight: '100vh', background: 'transparent' }}>
    <Sider
      width={220}
      style={{
        background: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border-color)',
        position: 'fixed',
        height: '100vh',
        overflow: 'auto'
      }}
    >
      <div style={{ 
        padding: '16px 16px 16px',
        borderBottom: '1px solid var(--border-color)',
      }}>
        <BrandMark />
        <div style={{ 
          color: 'var(--text-secondary)',
          fontSize: '12px',
          marginTop: '4px',
          marginLeft: '28px'
        }}>
          A股量化分析平台
        </div>
      </div>
      
      <Navigation />
      
      <div style={{ 
        position: 'absolute',
        bottom: '16px',
        left: '16px',
        right: '16px',
        paddingTop: '12px',
        borderTop: '1px solid var(--border-color)',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: '12px',
        color: 'var(--text-secondary)'
      }}>
        <span className="status-dot" style={{ color: 'var(--success-color)' }} aria-hidden="true" />
        <span>Powered by</span>
        <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>贾维斯</span>
      </div>
    </Sider>

    <Layout style={{ 
      marginLeft: 220,
      background: 'transparent'
    }}>
      <Header style={{
        background: 'var(--bg-base)',
        borderBottom: '1px solid var(--border-color)',
        padding: '0',
        position: 'sticky',
        top: 0,
        zIndex: 10,
        height: '52px',
        display: 'flex',
        alignItems: 'center'
      }}>
        <PageHeader />
      </Header>

      <Content style={{ 
        padding: '28px 32px 40px',
        background: 'transparent',
        minHeight: 'calc(100vh - 52px)'
      }}>
        <div style={{ maxWidth: '1440px', margin: '0 auto' }}>
          <PageTitle />
          {children}
        </div>
      </Content>
    </Layout>
  </Layout>
);

/**
 * 响应式布局包装器
 */
const ResponsiveLayout = ({ children }) => {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  React.useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return isMobile ? (
    <MobileLayout>{children}</MobileLayout>
  ) : (
    <DesktopLayout>{children}</DesktopLayout>
  );
};

/**
 * 主应用组件
 */
const App = () => {
  return (
    <Router>
      <ResponsiveLayout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/analysis" element={<AnalysisResults />} />
          <Route path="/fundflow" element={<FundFlow />} />
          <Route path="/sectors" element={<SectorHeat />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/watchlist" element={<WatchlistPage />} />
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="/data" element={<DataManager />} />
          <Route path="/strategy" element={<StrategyConfig />} />
          <Route path="/stock/:symbol" element={<StockDetailPage />} />
          <Route path="/chart/:symbol" element={<StockChartProPage />} />
        </Routes>
      </ResponsiveLayout>
    </Router>
  );
};

export default App;
