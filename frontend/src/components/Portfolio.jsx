/** Portfolio.jsx - 投资组合分析组件 */
import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Table, InputNumber, Button, Tag, Tooltip, Progress, Modal, Form, Input, Select, Statistic } from 'antd';
import { 
  PieChartOutlined, 
  LineChartOutlined,
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  CalculatorOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  BarChartOutlined
} from '@ant-design/icons';
import { LuxuryCard, LoadingState, ChangeDisplay } from './Common';
import axios from 'axios';
import { Pie, Line, Gauge } from '@ant-design/plots';

const { Option } = Select;

/**
 * 投资组合分析模块
 * - 多股票组合收益计算
 * - 风险指标（波动率、夏普比率）
 * - 组合配置建议
 */
const Portfolio = () => {
  const [portfolio, setPortfolio] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingStock, setEditingStock] = useState(null);

  // 初始化示例组合
  useEffect(() => {
    const samplePortfolio = [
      { symbol: '600519', name: '贵州茅台', price: 1688.88, quantity: 100, weight: 40 },
      { symbol: '300750', name: '宁德时代', price: 198.50, quantity: 500, weight: 30 },
      { symbol: '000858', name: '五粮液', price: 145.20, quantity: 400, weight: 20 },
      { symbol: '002594', name: '比亚迪', price: 268.80, quantity: 200, weight: 10 }
    ];
    setPortfolio(samplePortfolio);
    analyzePortfolio(samplePortfolio);
  }, []);

  const analyzePortfolio = async (stocks) => {
    setLoading(true);
    try {
      // 模拟分析数据
      const result = generateMockAnalysis(stocks);
      setAnalysis(result);
    } catch (error) {
      console.error('组合分析失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddStock = (values) => {
    const newStock = {
      symbol: values.symbol,
      name: values.name,
      price: values.price,
      quantity: values.quantity,
      weight: values.weight || 0
    };
    const updated = editingStock 
      ? portfolio.map(s => s.symbol === editingStock.symbol ? newStock : s)
      : [...portfolio, newStock];
    
    // 重新计算权重
    const totalValue = updated.reduce((sum, s) => sum + s.price * s.quantity, 0);
    updated.forEach(s => s.weight = ((s.price * s.quantity) / totalValue * 100));
    
    setPortfolio(updated);
    analyzePortfolio(updated);
    setModalVisible(false);
    setEditingStock(null);
  };

  const handleDelete = (symbol) => {
    const updated = portfolio.filter(s => s.symbol !== symbol);
    const totalValue = updated.reduce((sum, s) => sum + s.price * s.quantity, 0);
    updated.forEach(s => s.weight = ((s.price * s.quantity) / totalValue * 100));
    setPortfolio(updated);
    analyzePortfolio(updated);
  };

  const openEditModal = (stock) => {
    setEditingStock(stock);
    setModalVisible(true);
  };

  if (loading && !analysis) return <LoadingState text="分析组合中..." />;

  return (
    <div>
      {/* 组合概览 */}
      <Row gutter={[16, 16]}>
        <Col xs={24} md={6}>
          <LuxuryCard>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '32px', color: 'var(--primary-color)', marginBottom: '8px' }}>
                <PieChartOutlined />
              </div>
              <div className="data-label">组合总市值</div>
              <div style={{ 
                fontSize: '24px', 
                fontWeight: 'bold',
                color: 'var(--text-primary)',
                marginTop: '8px'
              }}>
                ¥{(analysis?.totalValue / 10000).toFixed(2)}万
              </div>
            </div>
          </LuxuryCard>
        </Col>
        <Col xs={24} md={6}>
          <LuxuryCard>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '32px', color: 'var(--success-color)', marginBottom: '8px' }}>
                <LineChartOutlined />
              </div>
              <div className="data-label">累计收益</div>
              <div style={{ 
                fontSize: '24px', 
                fontWeight: 'bold',
                color: analysis?.totalReturn >= 0 ? 'var(--success-color)' : 'var(--danger-color)',
                marginTop: '8px'
              }}>
                {analysis?.totalReturn >= 0 ? '+' : ''}{analysis?.totalReturn?.toFixed(2)}%
              </div>
            </div>
          </LuxuryCard>
        </Col>
        <Col xs={24} md={6}>
          <LuxuryCard>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '32px', color: 'var(--warning-color)', marginBottom: '8px' }}>
                <WarningOutlined />
              </div>
              <div className="data-label">波动率(年化)</div>
              <div style={{ 
                fontSize: '24px', 
                fontWeight: 'bold',
                color: analysis?.volatility > 20 ? 'var(--danger-color)' : 'var(--success-color)',
                marginTop: '8px'
              }}>
                {analysis?.volatility?.toFixed(2)}%
              </div>
            </div>
          </LuxuryCard>
        </Col>
        <Col xs={24} md={6}>
          <LuxuryCard>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '32px', color: 'var(--info-color)', marginBottom: '8px' }}>
                <BarChartOutlined />
              </div>
              <div className="data-label">夏普比率</div>
              <div style={{ 
                fontSize: '24px', 
                fontWeight: 'bold',
                color: analysis?.sharpeRatio > 1 ? 'var(--success-color)' : 'var(--text-primary)',
                marginTop: '8px'
              }}>
                {analysis?.sharpeRatio?.toFixed(2)}
              </div>
            </div>
          </LuxuryCard>
        </Col>
      </Row>

      {/* 组合详情 */}
      <Row gutter={[16, 16]} style={{ marginTop: '16px' }}>
        {/* 左侧：持仓列表 */}
        <Col xs={24} lg={14}>
          <LuxuryCard 
            title="持仓明细"
            extra={
              <Button 
                type="primary" 
                icon={<PlusOutlined />}
                onClick={() => { setEditingStock(null); setModalVisible(true); }}
              >
                添加股票
              </Button>
            }
          >
            <PortfolioTable 
              portfolio={portfolio}
              onEdit={openEditModal}
              onDelete={handleDelete}
            />
          </LuxuryCard>
        </Col>

        {/* 右侧：配置图表 */}
        <Col xs={24} lg={10}>
          <Row gutter={[16, 16]}>
            <Col span={24}>
              <LuxuryCard title="资产配置">
                <PortfolioPieChart data={portfolio} />
              </LuxuryCard>
            </Col>
            <Col span={24}>
              <LuxuryCard title="风险收益评估">
                <RiskReturnGauge analysis={analysis} />
              </LuxuryCard>
            </Col>
          </Row>
        </Col>
      </Row>

      {/* 收益走势 */}
      <Row style={{ marginTop: '16px' }}>
        <Col span={24}>
          <LuxuryCard title="组合收益走势">
            <PortfolioReturnChart data={analysis?.returns || []} />
          </LuxuryCard>
        </Col>
      </Row>

      {/* 配置建议 */}
      {analysis?.suggestions && (
        <Row style={{ marginTop: '16px' }}>
          <Col span={24}>
            <LuxuryCard title="配置建议">
              <PortfolioSuggestions suggestions={analysis.suggestions} />
            </LuxuryCard>
          </Col>
        </Row>
      )}

      {/* 添加/编辑股票模态框 */}
      <StockModal
        visible={modalVisible}
        onCancel={() => { setModalVisible(false); setEditingStock(null); }}
        onSubmit={handleAddStock}
        initialValues={editingStock}
      />
    </div>
  );
};

/**
 * 持仓表格
 */
const PortfolioTable = ({ portfolio, onEdit, onDelete }) => {
  const columns = [
    {
      title: '股票',
      dataIndex: 'name',
      render: (name, record) => (
        <div>
          <div style={{ fontWeight: 'bold' }}>{name}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{record.symbol}</div>
        </div>
      )
    },
    {
      title: '持仓数量',
      dataIndex: 'quantity',
      align: 'right',
      render: (qty) => qty.toLocaleString()
    },
    {
      title: '当前价格',
      dataIndex: 'price',
      align: 'right',
      render: (price) => `¥${price.toFixed(2)}`
    },
    {
      title: '市值',
      key: 'value',
      align: 'right',
      render: (_, record) => (
        <span>¥{(record.price * record.quantity / 10000).toFixed(2)}万</span>
      )
    },
    {
      title: '权重',
      dataIndex: 'weight',
      align: 'right',
      render: (weight) => (
        <Progress 
          percent={weight} 
          size="small" 
          style={{ width: '80px' }}
        />
      )
    },
    {
      title: '日涨跌',
      key: 'change',
      align: 'right',
      render: () => (
        <ChangeDisplay value={(Math.random() - 0.5) * 5} />
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_, record) => (
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button 
            size="small" 
            icon={<EditOutlined />}
            onClick={() => onEdit(record)}
          />
          <Button 
            size="small" 
            danger
            icon={<DeleteOutlined />}
            onClick={() => onDelete(record.symbol)}
          />
        </div>
      )
    }
  ];

  return (
    <Table
      columns={columns}
      dataSource={portfolio}
      rowKey="symbol"
      size="small"
      pagination={false}
      summary={(data) => {
        const totalValue = data.reduce((sum, item) => sum + item.price * item.quantity, 0);
        return (
          <Table.Summary.Row>
            <Table.Summary.Cell colSpan={3}><b>合计</b></Table.Summary.Cell>
            <Table.Summary.Cell align="right">
              <b>¥{(totalValue / 10000).toFixed(2)}万</b>
            </Table.Summary.Cell>
            <Table.Summary.Cell colSpan={3} />
          </Table.Summary.Row>
        );
      }}
    />
  );
};

/**
 * 资产配置饼图
 */
const PortfolioPieChart = ({ data }) => {
  const pieData = data.map(item => ({
    type: item.name,
    value: item.weight
  }));

  const config = {
    data: pieData,
    angleField: 'value',
    colorField: 'type',
    radius: 0.8,
    innerRadius: 0.5,
    label: {
      type: 'inner',
      content: '{name}\n{percentage}',
      style: {
        fontSize: 11,
        fill: '#fff'
      }
    },
    legend: {
      position: 'right',
      layout: 'vertical'
    },
    interactions: [{ type: 'element-active' }]
  };

  return <Pie {...config} height={250} />;
};

/**
 * 风险收益仪表盘
 */
const RiskReturnGauge = ({ analysis }) => {
  if (!analysis) return null;

  const configs = [
    {
      title: '风险等级',
      value: analysis.riskLevel,
      max: 10,
      color: analysis.riskLevel > 7 ? '#ff4d4f' : analysis.riskLevel > 4 ? '#faad14' : '#52c41a'
    },
    {
      title: '收益评分',
      value: analysis.returnScore,
      max: 100,
      color: analysis.returnScore > 70 ? '#52c41a' : analysis.returnScore > 50 ? '#faad14' : '#ff4d4f'
    },
    {
      title: '分散度',
      value: analysis.diversification,
      max: 100,
      color: analysis.diversification > 60 ? '#52c41a' : '#faad14'
    }
  ];

  return (
    <Row gutter={16}>
      {configs.map((cfg, idx) => (
        <Col span={8} key={idx}>
          <div style={{ textAlign: 'center' }}>
            <Gauge
              percent={cfg.value / cfg.max}
              range={{
                ticks: [0, 0.33, 0.67, 1],
                color: ['#52c41a', '#faad14', '#ff4d4f']
              }}
              indicator={{
                pointer: { style: { stroke: cfg.color } },
                pin: { style: { stroke: cfg.color } }
              }}
              statistic={{
                title: {
                  content: cfg.title,
                  style: { fontSize: '12px', color: 'var(--text-muted)' }
                },
                content: {
                  content: `${cfg.value}`,
                  style: { fontSize: '20px', fontWeight: 'bold', color: cfg.color }
                }
              }}
              height={150}
            />
          </div>
        </Col>
      ))}
    </Row>
  );
};

/**
 * 组合收益走势
 */
const PortfolioReturnChart = ({ data }) => {
  const config = {
    data: data.length > 0 ? data : generateMockReturnData(),
    xField: 'date',
    yField: 'value',
    seriesField: 'type',
    smooth: true,
    color: ['#52c41a', '#1890ff'],
    yAxis: {
      label: {
        formatter: (v) => `${v}%`
      }
    },
    tooltip: {
      formatter: (data) => {
        return { name: data.type, value: `${data.value.toFixed(2)}%` };
      }
    },
    legend: {
      position: 'top-right'
    },
    area: {
      style: {
        fillOpacity: 0.2
      }
    }
  };

  return <Line {...config} height={280} />;
};

/**
 * 配置建议
 */
const PortfolioSuggestions = ({ suggestions }) => {
  const getIcon = (type) => {
    switch (type) {
      case 'success': return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
      case 'warning': return <WarningOutlined style={{ color: '#faad14' }} />;
      case 'danger': return <WarningOutlined style={{ color: '#ff4d4f' }} />;
      default: return <CheckCircleOutlined style={{ color: '#1890ff' }} />;
    }
  };

  const getBgColor = (type) => {
    switch (type) {
      case 'success': return 'rgba(82, 196, 26, 0.1)';
      case 'warning': return 'rgba(250, 173, 20, 0.1)';
      case 'danger': return 'rgba(255, 77, 79, 0.1)';
      default: return 'rgba(24, 144, 255, 0.1)';
    }
  };

  return (
    <div>
      {suggestions.map((item, idx) => (
        <div
          key={idx}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            padding: '16px',
            marginBottom: '12px',
            background: getBgColor(item.type),
            borderRadius: '8px',
            border: `1px solid ${getBgColor(item.type).replace('0.1', '0.3')}`
          }}
        >
          <div style={{ fontSize: '20px', marginTop: '2px' }}>{getIcon(item.type)}</div>
          <div>
            <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{item.title}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>{item.content}</div>
            {item.action && (
              <Button type="link" size="small" style={{ padding: 0, marginTop: '8px' }}>
                {item.action}
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

/**
 * 股票添加/编辑模态框
 */
const StockModal = ({ visible, onCancel, onSubmit, initialValues }) => {
  const [form] = Form.useForm();

  useEffect(() => {
    if (visible) {
      if (initialValues) {
        form.setFieldsValue(initialValues);
      } else {
        form.resetFields();
      }
    }
  }, [visible, initialValues, form]);

  return (
    <Modal
      title={initialValues ? '编辑持仓' : '添加股票'}
      open={visible}
      onCancel={onCancel}
      onOk={() => form.submit()}
      okText={initialValues ? '保存' : '添加'}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={onSubmit}
      >
        <Form.Item
          name="symbol"
          label="股票代码"
          rules={[{ required: true, message: '请输入股票代码' }]}
        >
          <Input placeholder="如：600519" />
        </Form.Item>
        <Form.Item
          name="name"
          label="股票名称"
          rules={[{ required: true, message: '请输入股票名称' }]}
        >
          <Input placeholder="如：贵州茅台" />
        </Form.Item>
        <Form.Item
          name="price"
          label="当前价格"
          rules={[{ required: true, message: '请输入当前价格' }]}
        >
          <InputNumber 
            style={{ width: '100%' }} 
            min={0} 
            step={0.01}
            precision={2}
            prefix="¥"
          />
        </Form.Item>
        <Form.Item
          name="quantity"
          label="持仓数量"
          rules={[{ required: true, message: '请输入持仓数量' }]}
        >
          <InputNumber 
            style={{ width: '100%' }} 
            min={1}
            step={100}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};

// ============ 模拟数据生成 ============

const generateMockAnalysis = (portfolio) => {
  const totalValue = portfolio.reduce((sum, s) => sum + s.price * s.quantity, 0);
  
  // 计算权重
  portfolio.forEach(s => {
    s.weight = ((s.price * s.quantity) / totalValue * 100);
  });

  return {
    totalValue,
    totalReturn: 15.68 + (Math.random() - 0.5) * 10,
    volatility: 18.5 + (Math.random() - 0.5) * 10,
    sharpeRatio: 0.85 + (Math.random() - 0.5) * 0.5,
    maxDrawdown: -12.3 + (Math.random() - 0.5) * 5,
    beta: 0.92,
    alpha: 2.5,
    riskLevel: Math.floor(4 + Math.random() * 4),
    returnScore: Math.floor(60 + Math.random() * 30),
    diversification: Math.min(100, portfolio.length * 15 + Math.random() * 20),
    returns: generateMockReturnData(),
    suggestions: [
      {
        type: 'success',
        title: '组合分散度良好',
        content: '当前组合包含4个不同行业的股票，有效降低了单一行业风险。'
      },
      {
        type: 'warning',
        title: '白酒板块权重偏高',
        content: '白酒类股票（茅台、五粮液）合计占比约60%，建议适当分散到其他板块。',
        action: '查看调仓建议'
      },
      {
        type: 'info',
        title: '建议关注新能源板块',
        content: '根据近期资金流向分析，新能源板块资金持续流入，可考虑适当增加配置。'
      }
    ]
  };
};

const generateMockReturnData = () => {
  const dates = [];
  const portfolioReturns = [];
  const benchmarkReturns = [];
  
  let portfolioValue = 0;
  let benchmarkValue = 0;
  
  for (let i = 0; i < 30; i++) {
    const date = new Date();
    date.setDate(date.getDate() - (30 - i));
    dates.push(date.toISOString().split('T')[0]);
    
    portfolioValue += (Math.random() - 0.45) * 2;
    benchmarkValue += (Math.random() - 0.48) * 1.5;
    
    portfolioReturns.push({
      date: dates[i],
      type: '组合收益',
      value: portfolioValue
    });
    benchmarkReturns.push({
      date: dates[i],
      type: '基准收益',
      value: benchmarkValue
    });
  }
  
  return [...portfolioReturns, ...benchmarkReturns];
};

export default Portfolio;