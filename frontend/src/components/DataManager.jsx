import React, { useState, useEffect } from 'react';
import { 
  Table, Button, Space, Upload, message, Card, Row, Col, 
  Statistic, Progress, Tag, Tooltip, Modal, Form, Input,
  DatePicker, Select, Tabs, Alert, List, Divider
} from 'antd';
import { 
  UploadOutlined, DownloadOutlined, DatabaseOutlined,
  FileExcelOutlined, FileTextOutlined, CheckCircleOutlined,
  WarningOutlined, BugOutlined, SyncOutlined, DeleteOutlined,
  ExportOutlined, ImportOutlined, HistoryOutlined
} from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import { LuxuryCard, LoadingState } from './Common';

const { RangePicker } = DatePicker;
const { Option } = Select;
const { TabPane } = Tabs;

/**
 * 数据管理组件
 * 功能：数据导入导出、质量检查、统计信息
 */
const DataManager = () => {
  const [stats, setStats] = useState(null);
  const [symbols, setSymbols] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [qualityReport, setQualityReport] = useState(null);
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [exportSymbols, setExportSymbols] = useState([]);

  // 加载统计数据
  const loadStats = async () => {
    try {
      const response = await axios.get('/api/v1/data/stats');
      setStats(response.data);
    } catch (error) {
      console.error('加载统计失败:', error);
    }
  };

  // 加载股票列表
  const loadSymbols = async () => {
    try {
      const response = await axios.get('/api/v1/data/symbols');
      setSymbols(response.data.symbols || []);
    } catch (error) {
      console.error('加载股票列表失败:', error);
    }
  };

  // 初始加载
  useEffect(() => {
    loadStats();
    loadSymbols();
  }, []);

  // 查看股票历史数据
  const viewHistory = async (symbol) => {
    setLoading(true);
    setSelectedSymbol(symbol);
    try {
      const response = await axios.get(`/api/v1/data/history/${symbol}?limit=100`);
      setHistoryData(response.data.data || []);
    } catch (error) {
      message.error('获取历史数据失败');
    } finally {
      setLoading(false);
    }
  };

  // 检查数据质量
  const checkQuality = async (symbol) => {
    setLoading(true);
    try {
      const url = symbol 
        ? `/api/v1/data/quality/check?symbol=${symbol}`
        : '/api/v1/data/quality/check';
      const response = await axios.get(url);
      setQualityReport(response.data);
    } catch (error) {
      message.error('质量检查失败');
    } finally {
      setLoading(false);
    }
  };

  // 修复数据问题
  const fixIssues = async (symbol, issueType) => {
    try {
      const response = await axios.post(
        `/api/v1/data/quality/fix?symbol=${symbol}&issue_type=${issueType}`
      );
      if (response.data.success) {
        message.success('修复成功');
        checkQuality(symbol);
      } else {
        message.error(response.data.message || '修复失败');
      }
    } catch (error) {
      message.error('修复失败');
    }
  };

  // CSV导入配置
  const csvUploadProps = {
    name: 'file',
    action: '/api/v1/data/import/csv',
    accept: '.csv',
    onChange(info) {
      if (info.file.status === 'done') {
        message.success(`${info.file.name} 导入成功`);
        loadStats();
        loadSymbols();
        setImportModalVisible(false);
      } else if (info.file.status === 'error') {
        message.error(`${info.file.name} 导入失败`);
      }
    },
  };

  // Excel导入配置
  const excelUploadProps = {
    name: 'file',
    action: '/api/v1/data/import/excel',
    accept: '.xlsx,.xls',
    onChange(info) {
      if (info.file.status === 'done') {
        message.success(`${info.file.name} 导入成功`);
        loadStats();
        loadSymbols();
        setImportModalVisible(false);
      } else if (info.file.status === 'error') {
        message.error(`${info.file.name} 导入失败`);
      }
    },
  };

  // 导出CSV
  const exportCSV = (symbol) => {
    window.open(`/api/v1/data/export/csv/${symbol}`);
  };

  // 导出Excel
  const exportExcel = async () => {
    if (exportSymbols.length === 0) {
      message.warning('请选择要导出的股票');
      return;
    }
    
    try {
      const response = await axios.post('/api/v1/data/export/excel', exportSymbols, {
        responseType: 'blob'
      });
      
      // 下载文件
      const blob = new Blob([response.data], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `stocks_export_${dayjs().format('YYYYMMDD')}.xlsx`;
      link.click();
      window.URL.revokeObjectURL(url);
      
      message.success('导出成功');
      setExportModalVisible(false);
    } catch (error) {
      message.error('导出失败');
    }
  };

  // 表格列定义
  const columns = [
    {
      title: '股票代码',
      dataIndex: 'symbol',
      key: 'symbol',
      render: (text) => <span style={{ fontFamily: 'var(--font-mono)', fontWeight: '600' }}>{text}</span>
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="查看历史数据">
            <Button 
              icon={<HistoryOutlined />} 
              size="small"
              onClick={() => viewHistory(record.symbol)}
            />
          </Tooltip>
          <Tooltip title="导出CSV">
            <Button 
              icon={<FileTextOutlined />} 
              size="small"
              onClick={() => exportCSV(record.symbol)}
            />
          </Tooltip>
          <Tooltip title="检查数据质量">
            <Button 
              icon={<BugOutlined />} 
              size="small"
              onClick={() => checkQuality(record.symbol)}
            />
          </Tooltip>
        </Space>
      )
    }
  ];

  return (
    <div>
      <Tabs defaultActiveKey="overview">
        <TabPane 
          tab={<span><DatabaseOutlined />数据概览</span>} 
          key="overview"
        >
          {/* 统计卡片 */}
          {stats && (
            <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
              <Col xs={24} sm={12} md={6}>
                <LuxuryCard>
                  <Statistic 
                    title="股票数量" 
                    value={stats.total_symbols || 0}
                    valueStyle={{ color: 'var(--text-primary)', fontSize: '24px' }}
                    prefix={<DatabaseOutlined />}
                  />
                </LuxuryCard>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <LuxuryCard>
                  <Statistic 
                    title="数据记录" 
                    value={stats.total_records || 0}
                    valueStyle={{ color: 'var(--primary-color)', fontSize: '28px' }}
                  />
                </LuxuryCard>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <LuxuryCard>
                  <Statistic 
                    title="最早数据" 
                    value={stats.date_range?.min || '-'}
                    valueStyle={{ fontSize: '18px' }}
                  />
                </LuxuryCard>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <LuxuryCard>
                  <Statistic 
                    title="数据库大小" 
                    value={stats.db_size_mb || 0}
                    suffix="MB"
                    valueStyle={{ fontSize: '24px' }}
                  />
                </LuxuryCard>
              </Col>
            </Row>
          )}

          {/* 操作按钮 */}
          <LuxuryCard 
            title="数据操作"
            style={{ marginBottom: '24px' }}
          >
            <Space size="large">
              <Button 
                type="primary" 
                icon={<ImportOutlined />}
                onClick={() => setImportModalVisible(true)}
              >
                导入数据
              </Button>
              <Button 
                icon={<ExportOutlined />}
                onClick={() => setExportModalVisible(true)}
              >
                导出数据
              </Button>
              <Button 
                icon={<BugOutlined />}
                onClick={() => checkQuality()}
              >
                质量检查
              </Button>
              <Button 
                icon={<SyncOutlined />}
                onClick={() => { loadStats(); loadSymbols(); }}
              >
                刷新
              </Button>
            </Space>
          </LuxuryCard>

          {/* 股票列表 */}
          <LuxuryCard title="已存储的股票">
            <Table
              columns={columns}
              dataSource={symbols.map(s => ({ symbol: s, key: s }))}
              pagination={{ pageSize: 20 }}
              size="small"
            />
          </LuxuryCard>
        </TabPane>

        <TabPane 
          tab={<span><BugOutlined />质量检查</span>} 
          key="quality"
        >
          <LuxuryCard title="数据质量报告">
            {qualityReport ? (
              <div>
                {qualityReport.success ? (
                  <>
                    <Alert
                      message={`发现 ${qualityReport.total_issues} 个问题`}
                      type={qualityReport.total_issues > 0 ? 'warning' : 'success'}
                      showIcon
                      style={{ marginBottom: '16px' }}
                    />
                    
                    {qualityReport.issues?.map((issue, index) => (
                      <Card 
                        key={index} 
                        size="small" 
                        style={{ marginBottom: '12px' }}
                        title={
                          <Space>
                            <Tag color="red">{issue.symbol}</Tag>
                            <span>{issue.type}</span>
                          </Space>
                        }
                        extra={
                          <Button 
                            size="small" 
                            onClick={() => fixIssues(issue.symbol, issue.type)}
                          >
                            修复
                          </Button>
                        }
                      >
                        <pre style={{ margin: 0, fontSize: '12px' }}>
                          {JSON.stringify(issue.details || issue, null, 2)}
                        </pre>
                      </Card>
                    ))}
                  </>
                ) : (
                  <Alert message={qualityReport.error} type="error" />
                )}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px' }}>
                <Button 
                  type="primary" 
                  icon={<BugOutlined />}
                  onClick={() => checkQuality()}
                >
                  开始质量检查
                </Button>
              </div>
            )}
          </LuxuryCard>
        </TabPane>

        <TabPane 
          tab={<span><HistoryOutlined />历史数据</span>} 
          key="history"
        >
          <LuxuryCard title={selectedSymbol ? `${selectedSymbol} 历史数据` : '历史数据查看'}>
            {selectedSymbol ? (
              loading ? (
                <LoadingState text="加载历史数据..." />
              ) : (
                <Table
                  columns={[
                    { title: '日期', dataIndex: 'date', key: 'date' },
                    { title: '开盘', dataIndex: 'open', key: 'open', align: 'right' },
                    { title: '最高', dataIndex: 'high', key: 'high', align: 'right' },
                    { title: '最低', dataIndex: 'low', key: 'low', align: 'right' },
                    { title: '收盘', dataIndex: 'close', key: 'close', align: 'right' },
                    { title: '成交量', dataIndex: 'volume', key: 'volume', align: 'right' },
                  ]}
                  dataSource={historyData}
                  pagination={{ pageSize: 20 }}
                  size="small"
                  scroll={{ y: 400 }}
                />
              )
            ) : (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                请从"数据概览"中选择股票查看历史数据
              </div>
            )}
          </LuxuryCard>
        </TabPane>
      </Tabs>

      {/* 导入弹窗 */}
      <Modal
        title="导入数据"
        open={importModalVisible}
        onCancel={() => setImportModalVisible(false)}
        footer={null}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <div>
            <h4><FileTextOutlined /> CSV导入</h4>
            <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
              支持格式：date, open, high, low, close, volume
            </p>
            <Upload {...csvUploadProps}>
              <Button icon={<UploadOutlined />}>选择CSV文件</Button>
            </Upload>
          </div>
          
          <Divider />
          
          <div>
            <h4><FileExcelOutlined /> Excel导入</h4>
            <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
              每个sheet代表一只股票，sheet名为股票代码
            </p>
            <Upload {...excelUploadProps}>
              <Button icon={<UploadOutlined />}>选择Excel文件</Button>
            </Upload>
          </div>
        </Space>
      </Modal>

      {/* 导出弹窗 */}
      <Modal
        title="导出数据"
        open={exportModalVisible}
        onCancel={() => setExportModalVisible(false)}
        onOk={exportExcel}
        okText="导出Excel"
      >
        <Form layout="vertical">
          <Form.Item label="选择要导出的股票">
            <Select
              mode="multiple"
              placeholder="请选择股票代码"
              value={exportSymbols}
              onChange={setExportSymbols}
              style={{ width: '100%' }}
            >
              {symbols.map(s => (
                <Option key={s} value={s}>{s}</Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default DataManager;
