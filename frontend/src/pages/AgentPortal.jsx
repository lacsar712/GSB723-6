import React, { useEffect, useMemo, useState } from 'react';
import { Button, Layout, Menu, Space, Spin, Typography, notification } from 'antd';
import { ApartmentOutlined, KeyOutlined, NodeIndexOutlined, LogoutOutlined, HomeOutlined } from '@ant-design/icons';
import { Link, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import AgentLoginPage from './AgentLoginPage.jsx';
import AgentAgentsPage from './AgentAgentsPage.jsx';
import AgentCardKeysPage from './AgentCardKeysPage.jsx';
import AgentHierarchyPage from './AgentHierarchyPage.jsx';

const { Header, Sider, Content } = Layout;

const MENU_ITEMS = [
  { key: '/agent/agents', icon: <ApartmentOutlined />, label: '代理管理' },
  { key: '/agent/cards', icon: <KeyOutlined />, label: '卡密管理' },
  { key: '/agent/hierarchy', icon: <NodeIndexOutlined />, label: '上下级树' }
];

export default function AgentPortal() {
  const location = useLocation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [agent, setAgent] = useState(null);

  const selectedKeys = useMemo(() => {
    const key = MENU_ITEMS.find(i => location.pathname.startsWith(i.key))?.key ?? '/agent/agents';
    return [key];
  }, [location.pathname]);

  async function refreshMe() {
    try {
      const me = await api.me();
      setAgent(me);
    } catch {
      localStorage.removeItem('token');
      setAgent(null);
    }
  }

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }
    refreshMe().finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!agent) {
    return (
      <AgentLoginPage
        onAuthed={async () => {
          setLoading(true);
          await refreshMe();
          setLoading(false);
          navigate('/agent/agents', { replace: true });
        }}
      />
    );
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        theme="light"
        width={248}
        style={{
          background: 'linear-gradient(180deg, rgba(22,119,255,0.12) 0%, rgba(114,46,209,0.10) 55%, rgba(255,255,255,0.7) 100%)',
          borderRight: '1px solid rgba(0,0,0,0.06)'
        }}
      >
        <div style={{ padding: 18 }}>
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            <Typography.Text strong style={{ fontSize: 14 }}>
              代理后台
            </Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {agent.name}
            </Typography.Text>
          </Space>
        </div>
        <Menu
          mode="inline"
          selectedKeys={selectedKeys}
          items={MENU_ITEMS}
          onClick={({ key }) => navigate(key)}
          style={{ background: 'transparent' }}
        />
        <div style={{ padding: 16 }}>
          <Space direction="vertical" size={10} style={{ width: '100%' }}>
            <Button
              icon={<HomeOutlined />}
              onClick={() => navigate('/')}
              style={{ borderRadius: 12, width: '100%' }}
            >
              返回宣传页
            </Button>
            <Button
              danger
              icon={<LogoutOutlined />}
              onClick={() => {
                localStorage.removeItem('token');
                setAgent(null);
                notification.success({ message: '已退出登录', placement: 'topRight' });
              }}
              style={{ borderRadius: 12, width: '100%' }}
            >
              退出登录
            </Button>
          </Space>
        </div>
      </Sider>

      <Layout>
        <Header
          style={{
            background: 'rgba(255,255,255,0.75)',
            backdropFilter: 'blur(18px)',
            borderBottom: '1px solid rgba(0,0,0,0.06)',
            paddingInline: 20,
            position: 'sticky',
            top: 0,
            zIndex: 10
          }}
        >
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              卡密额度：{agent.card_quota_total} · 已用：{agent.card_quota_used} · 预留：{agent.card_quota_reserved}
            </Typography.Text>
            <Link to="/agent/hierarchy" style={{ fontSize: 13 }}>
              查看上下级
            </Link>
          </Space>
        </Header>
        <Content style={{ padding: 20 }}>
          <Routes>
            <Route index element={<AgentAgentsPage agent={agent} onRefresh={refreshMe} />} />
            <Route path="agents" element={<AgentAgentsPage agent={agent} onRefresh={refreshMe} />} />
            <Route path="cards" element={<AgentCardKeysPage agent={agent} onRefresh={refreshMe} />} />
            <Route path="hierarchy" element={<AgentHierarchyPage agent={agent} />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
}
