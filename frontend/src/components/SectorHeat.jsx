/** SectorHeat.jsx - 板块热点追踪组件 */
import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Tabs, Table, Tag, Badge, Tooltip } from 'antd';
import { 
  FireOutlined, 
  RiseOutlined, 
  FallOutlined,
  BarChartOutlined,
  MoneyCollectOutlined,
  AppstoreOutlined
} from '@ant-design/icons';
import { LuxuryCard, LoadingState, ChangeDisplay } from './Common';
import axios from 'axios';

const { TabPane } = Tabs;

/**
 * 板块热点追踪模块
 * - 行业板块涨跌热力图
 * - 板块内个股列表
 * - 板块资金流向
 */
const SectorHeat = () => {
  const [activeTab, setActiveTab] = useState('heatmap');
  const [selectedSector, setSelectedSector] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sectorData, setSectorData] = useState({
    sectors: [],
    fundFlow: [],
    topGainers: [],
    topLosers: []
  });

  useEffect(() => {
    fetchSectorData();
    const interval = setInterval(fetchSectorData, 60000);
    return () => clearInterval(interval);
  }, []);

  const fetchSectorData = async () => {
    try {
      // 模拟数据
      const mockData = generateMockSectorData();
      setSectorData(mockData);
      if (!selectedSector && mockData.sectors.length > 0) {
        setSelectedSector(mockData.sectors[0]);
      }
    } catch (error) {
      console.error('获取板块数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <LoadingState text="加载板块数据..." />;

  return (
    <div>
      {/* 板块统计概览 */}
      <Row gutter={[16, 16]}>
        <Col xs={24} md={6}>
          <LuxuryCard>
            <SectorStatCard 
              title="上涨板块"
              value={sectorData.stats?.upSectors}
              total={sectorData.stats?.totalSectors}
              icon={<RiseOutlined />}
              color="var(--success-color)"
            />
          </LuxuryCard>
        </Col>
        <Col xs={24} md={6}>
          <LuxuryCard>
            <SectorStatCard 
              title="下跌板块"
              value={sectorData.stats?.downSectors}
              total={sectorData.stats?.totalSectors}
              icon={<FallOutlined />}
              color="var(--danger-color)"
            />
          </LuxuryCard>
        </Col>
        <Col xs={24} md={6}>
          <LuxuryCard>
            <SectorStatCard 
              title="板块平均涨幅"
              value={sectorData.stats?.avgChange}
              icon={<BarChartOutlined />}
              color="var(--primary-color)"
              suffix="%"
            />
          </LuxuryCard>
        </Col>
        <Col xs={24} md={6}>
          <LuxuryCard>
            <SectorStatCard 
              title="总成交额"
              value={sectorData.stats?.totalVolume}
              icon={<MoneyCollectOutlined />}
              color="var(--warning-color)"
              suffix="亿"
            />
          </LuxuryCard>
        </Col>
      </Row>

      {/* 板块内容区 */}
      <Row gutter={[16, 16]} style={{ marginTop: '16px' }}>
        {/* 左侧：板块热力图/列表 */}
        <Col xs={24} lg={14}>
          <LuxuryCard title="板块热点">
            <Tabs activeKey={activeTab} onChange={setActiveTab}>
              <TabPane tab="涨跌热力图" key="heatmap">
                <SectorHeatMap 
                  sectors={sectorData.sectors}
                  onSelect={setSelectedSector}
                  selected={selectedSector}
                />
              </TabPane>
              <TabPane tab="板块排行" key="ranking">
                <SectorRankingTable 
                  sectors={sectorData.sectors}
                  onSelect={setSelectedSector}
                />
              </TabPane>
              <TabPane tab="资金流向" key="fundflow">
                <SectorFundFlowTable sectors={sectorData.fundFlow} />
              </TabPane>
            </Tabs>
          </LuxuryCard>
        </Col>

        {/* 右侧：板块详情 */}
        <Col xs={24} lg={10}>
          <LuxuryCard title={selectedSector ? `${selectedSector.name} - 板块详情` : '选择板块查看详情'}>
            {selectedSector ? (
              <SectorDetail sector={selectedSector} />
            ) : (
              <div style={{ 
                textAlign: 'center', 
                padding: '60px 20px',
                color: 'var(--text-muted)'
              }}>
                <AppstoreOutlined style={{ fontSize: '48px', marginBottom: '16px' }} />
                <p>点击左侧板块查看详细信息</p>
              </div>
            )}
          </LuxuryCard>
        </Col>
      </Row>
    </div>
  );
};

/**
 * 板块统计卡片
 */
const SectorStatCard = ({ title, value, total, icon, color, suffix = '' }) => {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '24px', color: color, marginBottom: '8px' }}>
        {icon}
      </div>
      <div className="data-label">{title}</div>
      <div style={{ 
        marginTop: '8px',
        fontSize: '24px',
        fontWeight: '700',
        color: color
      }}>
        {typeof value === 'number' ? value.toFixed(2) : value}{suffix}
        {total && <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>/{total}</span>}
      </div>
    </div>
  );
};

/**
 * 板块热力图
 */
const SectorHeatMap = ({ sectors, onSelect, selected }) => {
  const getHeatColor = (change) => {
    if (change >= 5) return 'rgba(229, 72, 77, 0.55)';
    if (change >= 3) return 'rgba(229, 72, 77, 0.40)';
    if (change >= 1) return 'rgba(229, 72, 77, 0.26)';
    if (change >= 0) return 'rgba(229, 72, 77, 0.14)';
    if (change >= -1) return 'rgba(48, 164, 108, 0.14)';
    if (change >= -3) return 'rgba(48, 164, 108, 0.26)';
    if (change >= -5) return 'rgba(48, 164, 108, 0.40)';
    return 'rgba(48, 164, 108, 0.55)';
  };

  const getHeatIntensity = (change) => {
    const absChange = Math.abs(change);
    if (absChange >= 5) return 1;
    if (absChange >= 3) return 0.85;
    if (absChange >= 1) return 0.7;
    if (absChange >= 0.5) return 0.5;
    return 0.3;
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '8px' }}>
      {sectors.map(sector => {
        const isSelected = selected?.code === sector.code;
        const heatColor = getHeatColor(sector.change);
        const intensity = getHeatIntensity(sector.change);
        
        return (
          <Tooltip 
            key={sector.code}
            title={`${sector.name}\n涨幅: ${sector.change >= 0 ? '+' : ''}${sector.change.toFixed(2)}%\n成交额: ${sector.volume.toFixed(1)}亿`}
          >
            <div
              onClick={() => onSelect(sector)}
              style={{
                padding: '12px 16px',
                borderRadius: '8px',
                cursor: 'pointer',
                background: heatColor,
                opacity: intensity,
                border: isSelected ? '1px solid var(--accent)' : '1px solid var(--border-color)',
                boxShadow: isSelected ? 'inset 0 0 0 1px var(--accent)' : 'none',
                transform: isSelected ? 'scale(1.05)' : 'scale(1)',
                transition: 'all 0.2s',
                minWidth: '100px',
                textAlign: 'center'
              }}
            >
              <div style={{ 
                fontWeight: 'bold', 
                color: 'var(--text-primary)',
                fontSize: '14px'
              }}>
                {sector.name}
              </div>
              <div style={{ 
                fontSize: '12px', 
                color: 'var(--text-primary)',
                marginTop: '4px'
              }}>
                {sector.change >= 0 ? '+' : ''}{sector.change.toFixed(2)}%
              </div>
            </div>
          </Tooltip>
        );
      })}
    </div>
  );
};

/**
 * 板块排行表格
 */
const SectorRankingTable = ({ sectors, onSelect }) => {
  const columns = [
    {
      title: '排名',
      dataIndex: 'rank',
      width: 60,
      render: (rank) => (
        <span style={{ 
          fontWeight: 'bold',
          color: rank <= 3 ? 'var(--text-primary)' : 'var(--text-secondary)'
        }}>
          {rank}
        </span>
      )
    },
    {
      title: '板块名称',
      dataIndex: 'name',
      render: (name, record) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 'bold' }}>{name}</span>
          {record.isHot && (
            <Tag color="red" icon={<FireOutlined />}>热门</Tag>
          )}
        </div>
      )
    },
    {
      title: '涨跌幅',
      dataIndex: 'change',
      sorter: (a, b) => a.change - b.change,
      render: (change) => <ChangeDisplay value={change} />
    },
    {
      title: '领涨股',
      dataIndex: 'leader',
      render: (leader) => (
        <div>
          <div>{leader?.name}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {leader?.symbol}
          </div>
        </div>
      )
    },
    {
      title: '成交额',
      dataIndex: 'volume',
      sorter: (a, b) => a.volume - b.volume,
      render: (volume) => `${volume.toFixed(1)}亿`
    },
    {
      title: '涨跌家数',
      key: 'upDown',
      render: (_, record) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ color: 'var(--success-color)' }}>{record.upCount}</span>
          <span>/</span>
          <span style={{ color: 'var(--danger-color)' }}>{record.downCount}</span>
        </div>
      )
    }
  ];

  return (
    <Table
      columns={columns}
      dataSource={sectors}
      rowKey="code"
      size="small"
      pagination={{ pageSize: 10 }}
      onRow={(record) => ({
        onClick: () => onSelect(record),
        style: { cursor: 'pointer' }
      })}
    />
  );
};

/**
 * 板块资金流向表格
 */
const SectorFundFlowTable = ({ sectors }) => {
  const columns = [
    {
      title: '板块',
      dataIndex: 'name',
      render: (name) => <span style={{ fontWeight: 'bold' }}>{name}</span>
    },
    {
      title: '主力净流入',
      dataIndex: 'mainInflow',
      sorter: (a, b) => a.mainInflow - b.mainInflow,
      render: (value) => (
        <span style={{ color: value >= 0 ? 'var(--success-color)' : 'var(--danger-color)' }}>
          {value >= 0 ? '+' : ''}{value.toFixed(2)}亿
        </span>
      )
    },
    {
      title: '散户净流入',
      dataIndex: 'retailInflow',
      render: (value) => (
        <span style={{ color: value >= 0 ? 'var(--success-color)' : 'var(--danger-color)' }}>
          {value >= 0 ? '+' : ''}{value.toFixed(2)}亿
        </span>
      )
    },
    {
      title: '大单占比',
      dataIndex: 'bigOrderRatio',
      render: (ratio) => (
        <Badge 
          count={`${ratio.toFixed(1)}%`}
          style={{ 
            backgroundColor: ratio > 50 ? 'var(--up-color)' : 'var(--down-color)'
          }}
        />
      )
    },
    {
      title: '5日流向',
      key: 'trend',
      render: (_, record) => <FundFlowTrend trend={record.trend} />
    }
  ];

  return (
    <Table
      columns={columns}
      dataSource={sectors}
      rowKey="code"
      size="small"
      pagination={{ pageSize: 10 }}
    />
  );
};

/**
 * 资金流向趋势
 */
const FundFlowTrend = ({ trend }) => {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
      {trend.map((value, i) => (
        <div
          key={i}
          style={{
            width: '8px',
            height: `${Math.abs(value) * 2 + 4}px`,
            backgroundColor: value >= 0 ? 'var(--up-color)' : 'var(--down-color)',
            borderRadius: '1px'
          }}
        />
      ))}
    </div>
  );
};

/**
 * 板块详情
 */
const SectorDetail = ({ sector }) => {
  const [activeTab, setActiveTab] = useState('stocks');

  return (
    <div>
      {/* 板块基本信息 */}
      <div style={{ 
        padding: '16px',
        background: 'var(--bg-tertiary)',
        borderRadius: '8px',
        marginBottom: '16px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '20px' }}>{sector.name}</h3>
            <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)', fontSize: '12px' }}>
              {sector.description}
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ 
              fontSize: '28px', 
              fontWeight: 'bold',
              color: sector.change >= 0 ? 'var(--success-color)' : 'var(--danger-color)'
            }}>
              {sector.change >= 0 ? '+' : ''}{sector.change.toFixed(2)}%
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              成交额 {sector.volume.toFixed(1)}亿
            </div>
          </div>
        </div>
      </div>

      {/* 板块成分股 */}
      <Tabs activeKey={activeTab} onChange={setActiveTab} size="small">
        <TabPane tab="成分股" key="stocks">
          <SectorStocksTable stocks={sector.stocks} />
        </TabPane>
        <TabPane tab="资金流向" key="fund">
          <SectorFundDetail sector={sector} />
        </TabPane>
      </Tabs>
    </div>
  );
};

/**
 * 板块成分股表格
 */
const SectorStocksTable = ({ stocks }) => {
  const columns = [
    {
      title: '排名',
      dataIndex: 'rank',
      width: 50,
      render: (rank) => (
        <span style={{ 
          color: rank <= 3 ? 'var(--text-primary)' : 'var(--text-secondary)',
          fontWeight: 'bold'
        }}>{rank}</span>
      )
    },
    {
      title: '股票',
      dataIndex: 'name',
      render: (name, record) => (
        <div>
          <div style={{ fontWeight: 'bold' }}>{name}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{record.symbol}</div>
        </div>
      )
    },
    {
      title: '价格',
      dataIndex: 'price',
      width: 80,
      render: (price) => price.toFixed(2)
    },
    {
      title: '涨跌幅',
      dataIndex: 'change',
      width: 90,
      sorter: (a, b) => a.change - b.change,
      render: (change) => <ChangeDisplay value={change} />
    },
    {
      title: '净流入',
      dataIndex: 'netInflow',
      width: 90,
      render: (value) => (
        <span style={{ 
          fontSize: '11px',
          color: value >= 0 ? 'var(--success-color)' : 'var(--danger-color)'
        }}>
          {value >= 0 ? '+' : ''}{value.toFixed(1)}亿
        </span>
      )
    }
  ];

  return (
    <Table
      columns={columns}
      dataSource={stocks}
      rowKey="symbol"
      size="small"
      pagination={false}
      scroll={{ y: 300 }}
    />
  );
};

/**
 * 板块资金详情
 */
const SectorFundDetail = ({ sector }) => {
  return (
    <div style={{ padding: '8px' }}>
      <Row gutter={[16, 16]}>
        <Col span={12}>
          <div style={{ textAlign: 'center', padding: '12px', background: 'var(--bg-tertiary)', borderRadius: '6px' }}>
            <div className="data-label">主力净流入</div>
            <div style={{ 
              fontSize: '20px', 
              fontWeight: 'bold',
              color: sector.mainInflow >= 0 ? 'var(--success-color)' : 'var(--danger-color)',
              marginTop: '8px'
            }}>
              {sector.mainInflow >= 0 ? '+' : ''}{sector.mainInflow.toFixed(2)}亿
            </div>
          </div>
        </Col>
        <Col span={12}>
          <div style={{ textAlign: 'center', padding: '12px', background: 'var(--bg-tertiary)', borderRadius: '6px' }}>
            <div className="data-label">散户净流入</div>
            <div style={{ 
              fontSize: '20px', 
              fontWeight: 'bold',
              color: sector.retailInflow >= 0 ? 'var(--success-color)' : 'var(--danger-color)',
              marginTop: '8px'
            }}>
              {sector.retailInflow >= 0 ? '+' : ''}{sector.retailInflow.toFixed(2)}亿
            </div>
          </div>
        </Col>
      </Row>

      <div style={{ marginTop: '16px' }}>
        <div className="data-label" style={{ marginBottom: '8px' }}>资金分布</div>
        <div style={{ display: 'flex', height: '24px', borderRadius: '4px', overflow: 'hidden' }}>
          <div style={{ 
            flex: sector.upCount,
            background: 'var(--success-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '11px',
            color: 'var(--text-primary)'
          }}>
            涨 {sector.upCount}
          </div>
          <div style={{ 
            flex: sector.flatCount,
            background: 'var(--text-muted)',
            minWidth: sector.flatCount > 0 ? '20px' : '0'
          }} />
          <div style={{ 
            flex: sector.downCount,
            background: 'var(--danger-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '11px',
            color: 'var(--text-primary)'
          }}>
            跌 {sector.downCount}
          </div>
        </div>
      </div>
    </div>
  );
};

// ============ 模拟数据生成 ============

const generateMockSectorData = () => {
  const sectors = [
    { code: 'bk01', name: '半导体', description: '芯片设计、制造、封装测试' },
    { code: 'bk02', name: '新能源', description: '光伏、风电、储能' },
    { code: 'bk03', name: '白酒', description: '白酒酿造与销售' },
    { code: 'bk04', name: '医药', description: '制药、医疗器械' },
    { code: 'bk05', name: '银行', description: '商业银行、投资银行' },
    { code: 'bk06', name: '地产', description: '房地产开发' },
    { code: 'bk07', name: '汽车', description: '整车制造、零部件' },
    { code: 'bk08', name: '化工', description: '基础化工、精细化工' },
    { code: 'bk09', name: '钢铁', description: '钢铁冶炼' },
    { code: 'bk10', name: '有色', description: '有色金属' },
    { code: 'bk11', name: '计算机', description: '软件开发、IT服务' },
    { code: 'bk12', name: '通信', description: '通信设备、运营' }
  ];

  const sectorData = sectors.map((sector, index) => ({
    ...sector,
    rank: index + 1,
    change: (Math.random() - 0.3) * 8,
    volume: 50 + Math.random() * 300,
    upCount: Math.floor(20 + Math.random() * 40),
    downCount: Math.floor(10 + Math.random() * 30),
    flatCount: Math.floor(Math.random() * 10),
    isHot: Math.random() > 0.7,
    leader: {
      symbol: `00${1000 + index}`,
      name: ['中芯国际', '隆基绿能', '茅台', '恒瑞', '招商银行', '万科', '比亚迪', '万华化学', '宝钢', '江西铜业', '金山办公', '中兴通讯'][index]
    },
    mainInflow: (Math.random() - 0.4) * 50,
    retailInflow: (Math.random() - 0.5) * 20,
    trend: Array(5).fill(0).map(() => (Math.random() - 0.5) * 20),
    stocks: generateMockStocks(sector.name, 15)
  }));

  // 按涨跌幅排序
  sectorData.sort((a, b) => b.change - a.change);
  sectorData.forEach((s, i) => s.rank = i + 1);

  const upSectors = sectorData.filter(s => s.change > 0).length;
  const avgChange = sectorData.reduce((sum, s) => sum + s.change, 0) / sectorData.length;
  const totalVolume = sectorData.reduce((sum, s) => sum + s.volume, 0);

  return {
    sectors: sectorData,
    fundFlow: sectorData.map(s => ({
      code: s.code,
      name: s.name,
      mainInflow: s.mainInflow,
      retailInflow: s.retailInflow,
      bigOrderRatio: 40 + Math.random() * 40,
      trend: s.trend
    })),
    stats: {
      upSectors,
      downSectors: sectorData.length - upSectors,
      totalSectors: sectorData.length,
      avgChange,
      totalVolume
    }
  };
};

const generateMockStocks = (sectorName, count) => {
  const stocks = [];
  for (let i = 0; i < count; i++) {
    stocks.push({
      rank: i + 1,
      symbol: `00${1000 + i}`,
      name: `${sectorName}股${String.fromCharCode(65 + i)}`,
      price: 10 + Math.random() * 100,
      change: (Math.random() - 0.4) * 10,
      netInflow: (Math.random() - 0.5) * 5
    });
  }
  return stocks.sort((a, b) => b.change - a.change);
};

export default SectorHeat;