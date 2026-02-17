import React, { useState, useEffect, useCallback } from 'react';
import { 
  Modal, Form, InputNumber, Select, Button, Space, List, Tag, 
  Switch, message, Empty, Badge, Tooltip, Popconfirm, Input
} from 'antd';
import { 
  BellOutlined, DeleteOutlined, PlusOutlined, EditOutlined,
  BellFilled, LineChartOutlined, PercentageOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { SciFiCard } from './Common';

const ALERTS_KEY = 'stock_analyzer_price_alerts';
const ALERTS_ENABLED_KEY = 'stock_analyzer_alerts_enabled';

/**
 * 价格预警管理组件
 * @param {string} symbol - 股票代码（可选，用于快速创建该股票的预警）
 * @param {string} name - 股票名称
 * @param {number} currentPrice - 当前价格
 * @param {boolean} showAsModal - 是否以弹窗形式显示
 * @param {function} onClose - 关闭回调
 */
const PriceAlert = ({ 
  symbol, 
  name, 
  currentPrice, 
  showAsModal = false, 
  onClose,
  className = '',
  style = {}
}) => {
  const [alerts, setAlerts] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [editingAlert, setEditingAlert] = useState(null);
  const [globalEnabled, setGlobalEnabled] = useState(true);
  const [notificationPermission, setNotificationPermission] = useState('default');

  // 加载预警设置
  const loadAlerts = useCallback(() => {
    try {
      const stored = localStorage.getItem(ALERTS_KEY);
      if (stored) {
        setAlerts(JSON.parse(stored));
      }
      const enabled = localStorage.getItem(ALERTS_ENABLED_KEY);
      setGlobalEnabled(enabled !== 'false');
    } catch (error) {
      console.error('加载预警设置失败:', error);
    }
  }, []);

  // 保存预警设置
  const saveAlerts = useCallback((newAlerts) => {
    try {
      localStorage.setItem(ALERTS_KEY, JSON.stringify(newAlerts));
      setAlerts(newAlerts);
    } catch (error) {
      console.error('保存预警设置失败:', error);
    }
  }, []);

  // 初始加载
  useEffect(() => {
    loadAlerts();
    // 检查通知权限
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
    }
  }, [loadAlerts]);

  // 请求通知权限
  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      message.warning('您的浏览器不支持桌面通知');
      return false;
    }

    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    
    if (permission === 'granted') {
      message.success('已获得通知权限');
      return true;
    } else {
      message.warning('请允许通知权限以接收价格预警');
      return false;
    }
  };

  // 发送桌面通知
  const sendNotification = useCallback((alert, stockData) => {
    if (!globalEnabled || notificationPermission !== 'granted') return;

    const title = `📈 价格预警 - ${alert.symbol}`;
    let body = '';
    
    switch (alert.type) {
      case 'price_above':
        body = `价格已上涨至 ¥${stockData.price.toFixed(2)}，超过预警线 ¥${alert.value}`;
        break;
      case 'price_below':
        body = `价格已下跌至 ¥${stockData.price.toFixed(2)}，低于预警线 ¥${alert.value}`;
        break;
      case 'change_above':
        body = `涨幅达到 ${stockData.change_percent.toFixed(2)}%，超过预警线 ${alert.value}%`;
        break;
      case 'change_below':
        body = `跌幅达到 ${stockData.change_percent.toFixed(2)}%，低于预警线 ${alert.value}%`;
        break;
      default:
        body = `${alert.symbol} 触发预警条件`;
    }

    new Notification(title, {
      body,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: alert.id,
      requireInteraction: true
    });
  }, [globalEnabled, notificationPermission]);

  // 检查预警条件
  const checkAlerts = useCallback(async () => {
    if (!globalEnabled || alerts.length === 0) return;

    // 获取所有活跃预警的股票数据
    const activeAlerts = alerts.filter(a => a.enabled);
    const symbols = [...new Set(activeAlerts.map(a => a.symbol))];

    for (const sym of symbols) {
      try {
        const response = await fetch(`/api/v1/stocks/${sym}/quote`);
        if (!response.ok) continue;
        
        const stockData = await response.json();
        const symbolAlerts = activeAlerts.filter(a => a.symbol === sym);

        symbolAlerts.forEach(alert => {
          let triggered = false;

          switch (alert.type) {
            case 'price_above':
              triggered = stockData.price >= alert.value;
              break;
            case 'price_below':
              triggered = stockData.price <= alert.value;
              break;
            case 'change_above':
              triggered = stockData.change_percent >= alert.value;
              break;
            case 'change_below':
              triggered = stockData.change_percent <= alert.value;
              break;
            default:
              break;
          }

          if (triggered) {
            // 检查是否已达到通知频率限制
            const lastTrigger = alert.lastTriggered 
              ? new Date(alert.lastTriggered) 
              : null;
            const now = new Date();
            const minInterval = (alert.frequency || 5) * 60 * 1000; // 默认5分钟

            if (!lastTrigger || (now - lastTrigger) > minInterval) {
              // 更新最后触发时间
              const updatedAlerts = alerts.map(a => 
                a.id === alert.id 
                  ? { ...a, lastTriggered: now.toISOString() } 
                  : a
              );
              saveAlerts(updatedAlerts);

              // 发送通知
              sendNotification(alert, stockData);
              
              // 显示消息
              message.info(`🚨 ${alert.symbol} 触发价格预警！`);
            }
          }
        });
      } catch (error) {
        console.error(`检查 ${sym} 预警失败:`, error);
      }
    }
  }, [alerts, globalEnabled, saveAlerts, sendNotification]);

  // 定时检查预警
  useEffect(() => {
    if (!globalEnabled) return;

    const interval = setInterval(checkAlerts, 30000); // 每30秒检查一次
    return () => clearInterval(interval);
  }, [checkAlerts, globalEnabled]);

  // 创建或更新预警
  const handleSaveAlert = (values) => {
    if (notificationPermission !== 'granted') {
      requestNotificationPermission();
    }

    const alertData = {
      id: editingAlert ? editingAlert.id : Date.now().toString(),
      symbol: symbol || values.symbol,
      name: name || values.name,
      type: values.type,
      value: values.value,
      frequency: values.frequency || 5,
      enabled: true,
      createdAt: editingAlert ? editingAlert.createdAt : new Date().toISOString(),
      lastTriggered: editingAlert ? editingAlert.lastTriggered : null
    };

    let newAlerts;
    if (editingAlert) {
      newAlerts = alerts.map(a => a.id === editingAlert.id ? alertData : a);
      message.success('预警已更新');
    } else {
      newAlerts = [...alerts, alertData];
      message.success('预警已创建');
    }

    saveAlerts(newAlerts);
    setEditingAlert(null);
    form.resetFields();
    
    if (showAsModal) {
      setModalVisible(false);
      if (onClose) onClose();
    }
  };

  // 删除预警
  const handleDeleteAlert = (id) => {
    const newAlerts = alerts.filter(a => a.id !== id);
    saveAlerts(newAlerts);
    message.success('预警已删除');
  };

  // 切换预警启用状态
  const toggleAlert = (id) => {
    const newAlerts = alerts.map(a => 
      a.id === id ? { ...a, enabled: !a.enabled } : a
    );
    saveAlerts(newAlerts);
  };

  // 切换全局预警
  const toggleGlobalAlerts = (enabled) => {
    setGlobalEnabled(enabled);
    localStorage.setItem(ALERTS_ENABLED_KEY, enabled.toString());
    if (enabled) {
      requestNotificationPermission();
    }
  };

  // 打开创建弹窗
  const openCreateModal = () => {
    setEditingAlert(null);
    form.resetFields();
    
    // 如果有传入当前价格，设置默认值
    if (currentPrice) {
      form.setFieldsValue({
        type: 'price_above',
        value: (currentPrice * 1.05).toFixed(2) // 默认涨5%
      });
    }
    
    setModalVisible(true);
  };

  // 打开编辑弹窗
  const openEditModal = (alert) => {
    setEditingAlert(alert);
    form.setFieldsValue({
      symbol: alert.symbol,
      type: alert.type,
      value: alert.value,
      frequency: alert.frequency
    });
    setModalVisible(true);
  };

  // 获取预警类型标签
  const getAlertTypeLabel = (type) => {
    const labels = {
      'price_above': '价格高于',
      'price_below': '价格低于',
      'change_above': '涨幅超过',
      'change_below': '跌幅超过',
      'ma_break': '均线突破',
      'volume_spike': '成交量突增'
    };
    return labels[type] || type;
  };

  // 获取预警类型颜色
  const getAlertTypeColor = (type) => {
    if (type.includes('above')) return 'var(--success-color)';
    if (type.includes('below')) return 'var(--danger-color)';
    return 'var(--primary-color)';
  };

  // 预警表单弹窗
  const AlertModal = () => (
    <Modal
      title={editingAlert ? '编辑预警' : '创建价格预警'}
      open={modalVisible || showAsModal}
      onCancel={() => {
        setModalVisible(false);
        setEditingAlert(null);
        if (onClose) onClose();
      }}
      footer={null}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSaveAlert}
        initialValues={{
          frequency: 5,
          type: 'price_above'
        }}
      >
        {!symbol && (
          <Form.Item
            name="symbol"
            label="股票代码"
            rules={[{ required: true, message: '请输入股票代码' }]}
          >
            <Input placeholder="如: 000001" />
          </Form.Item>
        )}

        <Form.Item
          name="type"
          label="预警条件"
          rules={[{ required: true }]}
        >
          <Select
            options={[
              { value: 'price_above', label: '价格高于', icon: <LineChartOutlined /> },
              { value: 'price_below', label: '价格低于', icon: <LineChartOutlined /> },
              { value: 'change_above', label: '涨幅超过', icon: <PercentageOutlined /> },
              { value: 'change_below', label: '跌幅超过', icon: <PercentageOutlined /> }
            ]}
          />
        </Form.Item>

        <Form.Item
          name="value"
          label="预警值"
          rules={[{ required: true, message: '请输入预警值' }]}
          help={currentPrice && `当前价格: ¥${currentPrice.toFixed(2)}`}
        >
          <InputNumber 
            style={{ width: '100%' }} 
            step={0.01}
            precision={2}
          />
        </Form.Item>

        <Form.Item
          name="frequency"
          label="通知频率（分钟）"
          help="同一预警的最小通知间隔"
        >
          <Select
            options={[
              { value: 1, label: '1分钟' },
              { value: 5, label: '5分钟' },
              { value: 15, label: '15分钟' },
              { value: 30, label: '30分钟' },
              { value: 60, label: '1小时' }
            ]}
          />
        </Form.Item>

        <Form.Item>
          <Space>
            <Button type="primary" htmlType="submit">
              {editingAlert ? '更新' : '创建'}
            </Button>
            <Button onClick={() => {
              setModalVisible(false);
              setEditingAlert(null);
            }}>
              取消
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  );

  // 预警列表组件
  const AlertList = () => (
    <List
      dataSource={alerts}
      locale={{
        emptyText: <Empty description="暂无预警，点击添加" />
      }}
      renderItem={item => (
        <List.Item
          actions={[
            <Switch
              checked={item.enabled}
              onChange={() => toggleAlert(item.id)}
              size="small"
            />,
            <Tooltip title="编辑">
              <Button
                icon={<EditOutlined />}
                size="small"
                onClick={() => openEditModal(item)}
              />
            </Tooltip>,
            <Popconfirm
              title="确定删除此预警？"
              onConfirm={() => handleDeleteAlert(item.id)}
            >
              <Button
                icon={<DeleteOutlined />}
                size="small"
                danger
              />
            </Popconfirm>
          ]}
        >
          <List.Item.Meta
            title={
              <Space>
                <span style={{ fontWeight: 'bold' }}>{item.symbol}</span>
                <span style={{ color: 'var(--text-secondary)' }}>{item.name}</span>
                {item.enabled && (
                  <Badge status="processing" text="监控中" />
                )}
              </Space>
            }
            description={
              <Space size="small">
                <Tag color={getAlertTypeColor(item.type)}>
                  {getAlertTypeLabel(item.type)}
                </Tag>
                <span>{item.value}{item.type.includes('change') ? '%' : '元'}</span>
                {item.lastTriggered && (
                  <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                    上次触发: {dayjs(item.lastTriggered).format('MM-DD HH:mm')}
                  </span>
                )}
              </Space>
            }
          />
        </List.Item>
      )}
    />
  );

  // 如果是弹窗模式，只返回弹窗
  if (showAsModal) {
    return <AlertModal />;
  }

  return (
    <>
      <SciFiCard
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <BellFilled style={{ color: 'var(--warning-color)' }} />
              <span>价格预警</span>
              <Badge 
                count={alerts.filter(a => a.enabled).length} 
                style={{ backgroundColor: 'var(--success-color)' }} 
              />
            </div>
            <Space size="small">
              <Tooltip title={globalEnabled ? '关闭预警' : '开启预警'}>
                <Switch
                  checked={globalEnabled}
                  onChange={toggleGlobalAlerts}
                  checkedChildren="ON"
                  unCheckedChildren="OFF"
                />
              </Tooltip>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                size="small"
                onClick={openCreateModal}
              >
                添加
              </Button>
            </Space>
          </div>
        }
        className={className}
        style={style}
      >
        {notificationPermission !== 'granted' && globalEnabled && (
          <div style={{ 
            marginBottom: '12px', 
            padding: '8px 12px',
            background: 'rgba(248, 81, 73, 0.1)',
            border: '1px solid var(--danger-color)',
            borderRadius: '4px',
            fontSize: '12px'
          }}>
            ⚠️ 请
            <Button 
              type="link" 
              size="small" 
              onClick={requestNotificationPermission}
              style={{ padding: '0 4px' }}
            >
              点击授权
            </Button>
            浏览器通知权限以接收预警
          </div>
        )}
        <AlertList />
      </SciFiCard>

      <AlertModal />
    </>
  );
};

/**
 * 快速预警按钮
 * 用于股票列表/详情页快速创建预警
 */
export const QuickAlertButton = ({ symbol, name, currentPrice, size = 'small' }) => {
  const [modalVisible, setModalVisible] = useState(false);

  return (
    <>
      <Tooltip title="设置预警">
        <Button
          icon={<BellOutlined />}
          size={size}
          onClick={() => setModalVisible(true)}
        />
      </Tooltip>
      
      {modalVisible && (
        <PriceAlert
          symbol={symbol}
          name={name}
          currentPrice={currentPrice}
          showAsModal={true}
          onClose={() => setModalVisible(false)}
        />
      )}
    </>
  );
};

export default PriceAlert;