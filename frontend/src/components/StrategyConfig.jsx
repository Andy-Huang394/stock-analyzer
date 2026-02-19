import React, { useState, useEffect, useCallback } from 'react';
import { Form, InputNumber, Button, Slider, Space, message, Card, Row, Col } from 'antd';
import { SettingOutlined, PlayCircleOutlined, SyncOutlined } from '@ant-design/icons';
import { LuxuryCard, LoadingState } from './Common';
import axios from 'axios';

/**
 * 策略配置面板
 */
const StrategyConfig = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [, setCurrentParams] = useState(null);

  const fetchCurrentParams = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/v1/strategy/params');
      const params = response.data.current_params;
      setCurrentParams(params);
      form.setFieldsValue(params);
    } catch (error) {
      console.error('获取策略参数失败:', error);
    } finally {
      setLoading(false);
    }
  }, [form]);

  useEffect(() => {
    fetchCurrentParams();
  }, [fetchCurrentParams]);

  const saveParams = async (values) => {
    setSaving(true);
    try {
      await axios.post('/api/v1/strategy/params', values);
      message.success('策略参数已更新');
      fetchCurrentParams();
    } catch (error) {
      message.error('保存失败');
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const runOptimization = async () => {
    setOptimizing(true);
    message.info('参数优化可能需要几分钟，请耐心等待...');
    
    try {
      // 这里使用一个示例股票进行优化
      const response = await axios.post('/api/v1/backtest/optimize', null, {
        params: { symbol: '000001', days: 120, combinations: 20 }
      });
      
      if (response.data.optimal_params) {
        form.setFieldsValue(response.data.optimal_params);
        message.success('参数优化完成！已应用最优参数');
      }
    } catch (error) {
      message.error('优化失败');
      console.error(error);
    } finally {
      setOptimizing(false);
    }
  };

  if (loading) return <LoadingState text="加载策略配置..." />;

  return (
    <LuxuryCard title="策略参数配置">
      <Form
        form={form}
        layout="vertical"
        onFinish={saveParams}
        style={{ maxWidth: '800px' }}
      >
        <Row gutter={24}>
          <Col span={12}>
            <Card 
              title={<span style={{ color: 'var(--primary-color)' }}>RSI 参数</span>}
              size="small"
              style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)' }}
            >
              <Form.Item name="rsi_period" label="RSI周期">
                <InputNumber min={5} max={30} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="rsi_overbought" label="超买阈值">
                <Slider min={60} max={90} />
              </Form.Item>
              <Form.Item name="rsi_oversold" label="超卖阈值">
                <Slider min={10} max={40} />
              </Form.Item>
            </Card>
          </Col>
          
          <Col span={12}>
            <Card 
              title={<span style={{ color: 'var(--secondary-color)' }}>MACD 参数</span>}
              size="small"
              style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)' }}
            >
              <Form.Item name="macd_fast" label="快线周期">
                <InputNumber min={5} max={20} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="macd_slow" label="慢线周期">
                <InputNumber min={15} max={40} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="macd_signal" label="信号线周期">
                <InputNumber min={5} max={15} style={{ width: '100%' }} />
              </Form.Item>
            </Card>
          </Col>
        </Row>

        <Row gutter={24} style={{ marginTop: '16px' }}>
          <Col span={12}>
            <Card 
              title={<span style={{ color: '#00ff88' }}>均线参数</span>}
              size="small"
              style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)' }}
            >
              <Form.Item name="ma_short" label="短期均线">
                <InputNumber min={3} max={20} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="ma_medium" label="中期均线">
                <InputNumber min={10} max={60} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="ma_long" label="长期均线">
                <InputNumber min={30} max={120} style={{ width: '100%' }} />
              </Form.Item>
            </Card>
          </Col>
          
          <Col span={12}>
            <Card 
              title={<span style={{ color: '#ffaa00' }}>权重配置</span>}
              size="small"
              style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)' }}
            >
              <Form.Item name="rsi_weight" label="RSI权重">
                <Slider min={0} max={1} step={0.05} />
              </Form.Item>
              <Form.Item name="macd_weight" label="MACD权重">
                <Slider min={0} max={1} step={0.05} />
              </Form.Item>
              <Form.Item name="ma_weight" label="均线权重">
                <Slider min={0} max={1} step={0.05} />
              </Form.Item>
            </Card>
          </Col>
        </Row>

        <div style={{ marginTop: '24px' }}>
          <Space size="large">
            <Button 
              type="primary"
              htmlType="submit"
              loading={saving}
              icon={<SettingOutlined />}
              className="scifi-button primary"
            >
              保存参数
            </Button>
            
            <Button 
              onClick={runOptimization}
              loading={optimizing}
              icon={<SyncOutlined spin={optimizing} />}
              className="scifi-button"
            >
              自动优化参数
            </Button>
            
            <Button 
              onClick={fetchCurrentParams}
              icon={<PlayCircleOutlined />}
              className="scifi-button"
            >
              重置
            </Button>
          </Space>
        </div>
      </Form>
    </LuxuryCard>
  );
};

export default StrategyConfig;
