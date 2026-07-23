import React, { useEffect, useState } from 'react';
import { Button, Card, Col, Row, Space, Tag, Typography } from 'antd';
import {
  ArrowRightOutlined,
  ApartmentOutlined,
  BranchesOutlined,
  KeyOutlined,
  LineChartOutlined,
  SafetyCertificateOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import './LandingPage.css';

const highlights = [
  { label: '节点代理', value: '∞' },
  { label: '卡密额度策略', value: '3层' },
  { label: '权限审计', value: '实时' }
];

const capabilityCards = [
  {
    title: '树状代理关系',
    desc: '自动维护上下级链路，支持快速检索与定位代理节点。',
    icon: <ApartmentOutlined />
  },
  {
    title: '卡密额度引擎',
    desc: '按应用、代理和额度规则生成卡密，减少人工分配成本。',
    icon: <KeyOutlined />
  },
  {
    title: '层级增长分析',
    desc: '追踪额度消耗与层级扩展趋势，提前识别高风险波动。',
    icon: <LineChartOutlined />
  },
  {
    title: '安全认证机制',
    desc: '名称哈希与密码校验并行，保障代理登录链路可控。',
    icon: <SafetyCertificateOutlined />
  }
];

const launchSteps = [
  { id: '01', title: '创建主代理', desc: '配置基础额度与优先级，建立第一层管理节点。' },
  { id: '02', title: '绑定应用策略', desc: '为代理分配应用范围和卡密规则，统一交付标准。' },
  { id: '03', title: '扩展下级网络', desc: '按树状结构持续扩容，同时保持链路透明和可回溯。' }
];

export default function LandingPage() {
  const navigate = useNavigate();
  const [isLoggedIn, setIsLoggedIn] = useState(() => Boolean(localStorage.getItem('token')));

  useEffect(() => {
    const syncLoginState = () => setIsLoggedIn(Boolean(localStorage.getItem('token')));
    syncLoginState();
    window.addEventListener('storage', syncLoginState);
    window.addEventListener('focus', syncLoginState);
    return () => {
      window.removeEventListener('storage', syncLoginState);
      window.removeEventListener('focus', syncLoginState);
    };
  }, []);

  return (
    <main className="landing-page">
      <div className="landing-glow landing-glow-left" />
      <div className="landing-glow landing-glow-right" />

      <section className="landing-hero">
        <div className="landing-hero-copy">
          <Tag bordered={false} className="landing-tag">
            代理平台 2.0
          </Tag>
          <Typography.Title level={1} className="landing-title">
            一套后台，打通代理体系与卡密交付
          </Typography.Title>
          <Typography.Paragraph className="landing-subtitle">
            从代理层级、额度规则到应用绑定，全部集中在一个面板中管理，降低协作损耗并提升扩展效率。
          </Typography.Paragraph>
          <Space size={12} wrap>
            <Button
              type="primary"
              size="large"
              icon={<ArrowRightOutlined />}
              className="landing-primary-btn"
              onClick={() => navigate('/agent')}
            >
              进入代理后台
            </Button>
            <Button size="large" className="landing-secondary-btn" onClick={() => navigate('/agent')}>
              {isLoggedIn ? '已登录' : '立即登录'}
            </Button>
          </Space>
          <div className="landing-highlight-list">
            {highlights.map(item => (
              <div key={item.label} className="landing-highlight-item">
                <div className="landing-highlight-value">{item.value}</div>
                <div className="landing-highlight-label">{item.label}</div>
              </div>
            ))}
          </div>
        </div>

        <Card bordered={false} className="landing-panel">
          <div className="landing-panel-title">
            <BranchesOutlined />
            <span>代理网络实时概览</span>
          </div>
          <div className="landing-panel-grid">
            <div className="landing-panel-block">
              <div className="landing-panel-value">128</div>
              <div className="landing-panel-label">总代理节点</div>
            </div>
            <div className="landing-panel-block">
              <div className="landing-panel-value">92%</div>
              <div className="landing-panel-label">卡密发放成功率</div>
            </div>
            <div className="landing-panel-block">
              <div className="landing-panel-value">2.4h</div>
              <div className="landing-panel-label">平均链路回收时间</div>
            </div>
            <div className="landing-panel-block">
              <div className="landing-panel-value">0</div>
              <div className="landing-panel-label">未审计异常节点</div>
            </div>
          </div>
        </Card>
      </section>

      <section className="landing-section">
        <Typography.Title level={2} className="landing-section-title">
          核心能力
        </Typography.Title>
        <Row gutter={[16, 16]}>
          {capabilityCards.map(card => (
            <Col key={card.title} xs={24} sm={12}>
              <Card bordered={false} className="landing-capability-card">
                <div className="landing-card-icon">{card.icon}</div>
                <Typography.Title level={4} className="landing-card-title">
                  {card.title}
                </Typography.Title>
                <Typography.Paragraph className="landing-card-desc">{card.desc}</Typography.Paragraph>
              </Card>
            </Col>
          ))}
        </Row>
      </section>

      <section className="landing-section">
        <Typography.Title level={2} className="landing-section-title">
          三步上线
        </Typography.Title>
        <div className="landing-steps">
          {launchSteps.map(step => (
            <div key={step.id} className="landing-step-card">
              <div className="landing-step-id">{step.id}</div>
              <Typography.Title level={4} className="landing-step-title">
                {step.title}
              </Typography.Title>
              <Typography.Paragraph className="landing-step-desc">{step.desc}</Typography.Paragraph>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-cta">
        <Typography.Title level={2} className="landing-cta-title">
          用树状管理替代分散流程
        </Typography.Title>
        <Typography.Paragraph className="landing-cta-desc">
          现在就进入后台，创建首个代理节点并生成第一批可追踪卡密。
        </Typography.Paragraph>
        <Button type="primary" size="large" className="landing-primary-btn" onClick={() => navigate('/agent')}>
          开始使用
        </Button>
      </section>
    </main>
  );
}
