import React, { useState } from 'react';
import { Button, Card, Form, Input, Space, Typography } from 'antd';
import { LockOutlined, UserOutlined, ArrowRightOutlined } from '@ant-design/icons';
import { api } from '../lib/api.js';
import { Link } from 'react-router-dom';

export default function AgentLoginPage({ onAuthed }) {
  const [submitting, setSubmitting] = useState(false);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        background:
          'radial-gradient(1200px 600px at 20% 0%, rgba(22,119,255,0.22), transparent 60%), radial-gradient(1000px 520px at 90% 0%, rgba(114,46,209,0.18), transparent 55%), linear-gradient(180deg, #f7fbff 0%, #ffffff 50%, #f7fbff 100%)'
      }}
    >
      <Card
        bordered={false}
        style={{
          width: 420,
          borderRadius: 16,
          boxShadow: '0 18px 44px rgba(22,119,255,0.14)',
          background: 'rgba(255,255,255,0.75)',
          backdropFilter: 'blur(18px)'
        }}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <div>
            <Typography.Title level={3} style={{ margin: 0 }}>
              代理登录
            </Typography.Title>
          </div>

          <Form
            layout="vertical"
            onFinish={async (values) => {
              setSubmitting(true);
              try {
                const data = await api.login(values);
                localStorage.setItem('token', data.token);
                onAuthed?.(data.agent);
              } finally {
                setSubmitting(false);
              }
            }}
          >
            <Form.Item
              name="name"
              label="账号名"
              rules={[
                { required: true, message: '请输入账号名' },
                { min: 2, max: 80, message: '账号名长度需为2-80' }
              ]}
            >
              <Input prefix={<UserOutlined />} placeholder="请输入账号名" size="large" style={{ borderRadius: 12 }} />
            </Form.Item>

            <Form.Item
              name="password"
              label="密码"
              rules={[{ required: true, message: '请输入密码' }, { min: 6, message: '密码至少6位' }]}
            >
              <Input.Password prefix={<LockOutlined />} placeholder="请输入密码" size="large" style={{ borderRadius: 12 }} />
            </Form.Item>

            <Button
              type="primary"
              htmlType="submit"
              loading={submitting}
              icon={<ArrowRightOutlined />}
              size="large"
              style={{ width: '100%', borderRadius: 12 }}
            >
              登录
            </Button>
          </Form>

          <Space style={{ justifyContent: 'space-between', width: '100%' }}>
            <Link to="/" style={{ fontSize: 13 }}>
              返回宣传页
            </Link>
          </Space>
        </Space>
      </Card>
    </div>
  );
}
