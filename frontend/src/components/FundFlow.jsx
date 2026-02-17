/** FundFlow.jsx - 资金流向分析组件 */
import React, { useState, useEffect } from 'react';
import { Row, Col, Tabs, Table, Tag, Progress, Tooltip } from 'antd';
import { 
  ArrowUpOutlined, 
  ArrowDownOutlined,
  FireOutlined,
  TeamOutlined,
  BarChartOutlined,
  MoneyCollectOutlined
} from '@ant-design/icons';
import { SciFiCard, LoadingState } from './Common';
import axios from 'axios';
import { Line, Column } from '@ant-design/plots';

const { TabPane } = Tabs;

/**
 * 资金流向分析模块
 * - 主力资金流入/流出排行
 * - 散户资金流向图表
 * - 资金净流入TOP10股票
 */
const FundFlow = () => {
  const [activeTab, setActiveTab] = useState('main');
  const [loading, setLoading] = useState(true);
  const [fundData, setFundData] = useState({
    mainInflow: [],
    mainOutflow: [],
    retailFlow: [],
    netInflowTop: []
  });

  useEffect(() => {
    fetchFundFlowData();
    const interval = setInterval(fetchFundFlowData, 60000); // 每分钟刷新
    return () => clearInterval(interval);
  }, []);

  const fetchFundFlowData = async () => {
    try {
      // 模拟数据 - 实际项目中应从API获取
      const mockData = generateMockFundData();
      setFundData(mockData);
    } catch (error) {
      console.error('获取资金流向数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <LoadingState text="加载资金流向数据..." />;

  return (
    <div>
      <Row gutter={[16, 16]}>
        {/* 资金概览统计 */}
        <Col xs={24} md={6}>
          <SciFiCard>
            <FundSummaryCard 
              title="主力净流入"
              value={fundData.summary?.mainNetInflow}
              icon={<FireOutlined />}
              color="var(--success-color)"
            />
          </SciFiCard>
        </Col>
        <Col xs={24} md={6}>
          <SciFiCard>
            <FundSummaryCard 
              title="散户净流入"
              value={fundData.summary?.retailNetInflow}
              icon={<TeamOutlined />}
              color="var(--primary-color)"
            />
          </SciFiCard>
        </Col>
        <Col xs={24} md={6}>
          <SciFiCard>
            <FundSummaryCard 
              title="大单成交占比"
              value={fundData.summary?.bigOrderRatio}
              icon={<BarChartOutlined />}
              color="var(--warning-color)"
              suffix="%"
            />
          </SciFiCard>
        </Col>
        <Col xs={24} md={6}>
          <SciFiCard>
            <FundSummaryCard 
              title="总成交额"
              value={fundData.summary?.totalVolume}
              icon={<MoneyCollectOutlined />}
              color="var(--info-color)"
              suffix="亿"
            />
          </SciFiCard>
        </Col>
      </Row>

      {/* 主力与散户资金流向图表 */}
      <Row gutter={[16, 16]} style={{ marginTop: '16px' }}>
        <Col xs={24} lg={12}>
          <SciFiCard title="主力资金流向趋势">
            <MainFundFlowChart data={fundData.mainFlowTrend} />
          </SciFiCard>
        </Col>
        <Col xs={24} lg={12}>
          <SciFiCard title="散户资金流向趋势">
            <RetailFundFlowChart data={fundData.retailFlowTrend} />
          </SciFiCard>
        </Col>
      </Row>

      {/* 资金流向排行 */}
      <Row style={{ marginTop: '16px' }}>
        <Col span={24}>
          <SciFiCard title="资金流向排行">
            <Tabs activeKey={activeTab} onChange={setActiveTab}>
              <TabPane tab="主力净流入TOP10" key="main">
                <FundFlowTable 
                  data={fundData.mainInflow} 
                  type="inflow"
                  showTags={true}
                />
              </TabPane>
              <TabPane tab="主力净流出TOP10" key="outflow">
                <FundFlowTable 
                  data={fundData.mainOutflow} 
                  type="outflow"
                  showTags={true}
                />
              </TabPane>
              <TabPane tab="散户资金动向" key="retail">
                <FundFlowTable 
                  data={fundData.retailFlow} 
                  type="retail"
                  showTags={false}
                />
              </TabPane>
            </Tabs>
          </SciFiCard>
        </Col>
      </Row>
    </div>
  );
};

/**
 * 资金概览卡片
 */
const FundSummaryCard = ({ title, value, icon, color, suffix = '' }) => {
  const isPositive = value >= 0;
  const displayValue = Math.abs(value);
  
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ 
        fontSize: '24px', 
        color: color,
        marginBottom: '8px'
      }}>
        {icon}
      </div>
      <div className="data-label">{title}</div>
      <div style={{ 
        marginTop: '8px',
        fontSize: '24px',
        fontWeight: '700',
        color: value >= 0 ? 'var(--success-color)' : 'var(--danger-color)'
      }}>
        {isPositive ? '+' : '-'}{displayValue.toFixed(2)}{suffix}
      </div>
    </div>
  );
};

/**
 * 主力资金流向趋势图
 */
const MainFundFlowChart = ({ data }) => {
  const config = {
    data: data || generateMockTrendData(),
    xField: 'time',
    yField: 'value',
    seriesField: 'type',
    smooth: true,
    color: ['#52c41a', '#ff4d4f'],
    legend: {
      position: 'top-right'
    },
    yAxis: {
      label: {
        formatter: (v) => `${v}亿`
      }
    },
    tooltip: {
      formatter: (data) => {
        return { name: data.type, value: `${data.value}亿` };
      }
    },
    area: {
      style: {
        fillOpacity: 0.3
      }
    }
  };

  return <Line {...config} height={280} />;
};

/**
 * 散户资金流向趋势图
 */
const RetailFundFlowChart = ({ data }) => {
  const config = {
    data: data || generateMockRetailData(),
    xField: 'time',
    yField: 'value',
    columnStyle: (data) => {
      return {
        fill: data.value >= 0 ? '#52c41a' : '#ff4d4f'
      };
    },
    yAxis: {
      label: {
        formatter: (v) => `${v}亿`
      }
    },
    tooltip: {
      formatter: (data) => {
        return { name: '散户资金流向', value: `${data.value}亿` };
      }
    },
    label: {
      position: 'top',
      style: {
        fill: '#8c8c8c'
      }
    }
  };

  return <Column {...config} height={280} />;
};

/**
 * 资金流向表格
 */
const FundFlowTable = ({ data, type, showTags }) => {
  const columns = [
    {
      title: '排名',
      dataIndex: 'rank',
      width: 60,
      render: (rank) => (
        <span style={{ 
          fontWeight: 'bold',
          color: rank <= 3 ? '#ffd700' : 'var(--text-secondary)'
        }}>
          {rank}
        </span>
      )
    },
    {
      title: '股票代码',
      dataIndex: 'symbol',
      width: 100,
      render: (symbol, record) => (
        <div>
          <div style={{ fontWeight: 'bold' }}>{symbol}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {record.name}
          </div>
        </div>
      )
    },
    {
      title: '最新价',
      dataIndex: 'price',
      width: 100,
      render: (price, record) => (
        <span style={{ 
          color: record.change >= 0 ? 'var(--success-color)' : 'var(--danger-color)'
        }}>
          {price.toFixed(2)}
        </span>
      )
    },
    {
      title: '涨跌幅',
      dataIndex: 'change',
      width: 100,
      render: (change) => (
        <span style={{ 
          color: change >= 0 ? 'var(--success-color)' : 'var(--danger-color)'
        }}>
          {change >= 0 ? '+' : ''}{change.toFixed(2)}%
        </span>
      )
    },
    {
      title: '净流入',
      dataIndex: 'netInflow',
      width: 120,
      render: (value) => (
        <span style={{ 
          color: value >= 0 ? 'var(--success-color)' : 'var(--danger-color)',
          fontWeight: 'bold'
        }}>
          {value >= 0 ? '+' : ''}{value.toFixed(2)}亿
        </span>
      )
    },
    {
      title: '主力净流入',
      dataIndex: 'mainInflow',
      width: 120,
      render: (value) => (
        <span style={{ color: value >= 0 ? '#52c41a' : '#ff4d4f' }}>
          {value >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
          {Math.abs(value).toFixed(2)}亿
        </span>
      )
    },
    {
      title: '占比',
      dataIndex: 'ratio',
      width: 120,
      render: (ratio, record) => (
        <Tooltip title={`占成交额 ${ratio}%`}>
          <Progress 
            percent={Math.abs(ratio)} 
            size="small"
            strokeColor={record.netInflow >= 0 ? '#52c41a' : '#ff4d4f'}
            showInfo={false}
          />
        </Tooltip>
      )
    },
    ...(showTags ? [{
      title: '标签',
      dataIndex: 'tags',
      render: (tags) => (
        <span>
          {tags?.map((tag, i) => (
            <Tag key={i} color={tag.color} style={{ fontSize: '11px' }}>
              {tag.name}
            </Tag>
          ))}
        </span>
      )
    }] : [])
  ];

  return (
    <Table 
      columns={columns}
      dataSource={data}
      rowKey="symbol"
      pagination={false}
      size="small"
      scroll={{ x: 'max-content' }}
    />
  );
};

// ============ 模拟数据生成函数 ============

const generateMockFundData = () => {
  const stocks = [
    { symbol: '600519', name: '贵州茅台', price: 1688.88 },
    { symbol: '300750', name: '宁德时代', price: 198.50 },
    { symbol: '000858', name: '五粮液', price: 145.20 },
    { symbol: '002594', name: '比亚迪', price: 268.80 },
    { symbol: '601318', name: '中国平安', price: 42.35 },
    { symbol: '600036', name: '招商银行', price: 32.18 },
    { symbol: '000333', name: '美的集团', price: 58.92 },
    { symbol: '002415', name: '海康威视', price: 31.56 },
    { symbol: '600276', name: '恒瑞医药', price: 45.28 },
    { symbol: '300059', name: '东方财富', price: 15.88 }
  ];

  // 主力净流入TOP10
  const mainInflow = stocks.map((stock, index) => ({
    rank: index + 1,
    ...stock,
    change: 2.5 + Math.random() * 5,
    netInflow: 5 + Math.random() * 15,
    mainInflow: 3 + Math.random() * 12,
    ratio: 15 + Math.random() * 20,
    tags: [
      { name: '主力增仓', color: 'green' },
      { name: '连续流入', color: 'blue' }
    ]
  })).sort((a, b) => b.netInflow - a.netInflow);

  // 主力净流出TOP10
  const mainOutflow = stocks.map((stock, index) => ({
    rank: index + 1,
    ...stock,
    price: stock.price * 0.95,
    change: -(1.5 + Math.random() * 4),
    netInflow: -(3 + Math.random() * 8),
    mainInflow: -(2 + Math.random() * 6),
    ratio: -(10 + Math.random() * 15),
    tags: [
      { name: '主力减仓', color: 'red' },
      { name: '警惕', color: 'orange' }
    ]
  })).sort((a, b) => a.netInflow - b.netInflow);

  // 散户资金流向
  const retailFlow = stocks.map((stock, index) => ({
    rank: index + 1,
    ...stock,
    change: (Math.random() - 0.5) * 4,
    netInflow: (Math.random() - 0.5) * 5,
    mainInflow: (Math.random() - 0.5) * 3,
    ratio: (Math.random() - 0.5) * 10
  })).sort((a, b) => b.netInflow - a.netInflow);

  return {
    summary: {
      mainNetInflow: 128.56,
      retailNetInflow: -45.23,
      bigOrderRatio: 62.8,
      totalVolume: 8567.32
    },
    mainInflow,
    mainOutflow,
    retailFlow,
    mainFlowTrend: generateMockTrendData(),
    retailFlowTrend: generateMockRetailData()
  };
};

const generateMockTrendData = () => {
  const times = ['09:30', '10:00', '10:30', '11:00', '11:30', '13:00', '13:30', '14:00', '14:30', '15:00'];
  const data = [];
  
  times.forEach(time => {
    data.push(
      { time, type: '流入', value: 20 + Math.random() * 30 },
      { time, type: '流出', value: 15 + Math.random() * 25 }
    );
  });
  
  return data;
};

const generateMockRetailData = () => {
  const times = ['09:30', '10:00', '10:30', '11:00', '11:30', '13:00', '13:30', '14:00', '14:30', '15:00'];
  return times.map(time => ({
    time,
    value: (Math.random() - 0.5) * 20
  }));
};

export default FundFlow;