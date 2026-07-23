import React, { useState } from 'react';
import { api } from '../lib/api.js';
import { Button, Form, Input, Modal, Space, Tabs, Typography, notification } from 'antd';

export default function AuthModal({ open, onClose, onAuthed }) {
  const [tab, setTab] = useState('login');
  const [loading, setLoading] = useState(false);
  const [loginForm] = Form.useForm();
  const [registerForm] = Form.useForm();

  const doLogin = async values => {
    setLoading(true);
    try {
      const res = await api.login(values);
      localStorage.setItem('token', res.token);
      onAuthed?.(res.user);
      notification.success({ message: '登录成功', placement: 'topRight' });
      onClose?.();
    } finally {
      setLoading(false);
    }
  };

  const doRegister = async values => {
    setLoading(true);
    try {
      await api.register(values);
      notification.success({ message: '注册成功，请登录', placement: 'topRight' });
      setTab('login');
      loginForm.setFieldsValue({ username: values.username });
    } catch (e) {
      notification.error({ message: '注册失败', description: e?.message || '请稍后重试', placement: 'topRight' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onCancel={onClose} footer={null} destroyOnClose title="账号">
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          {
            key: 'login',
            label: '登录',
            children: (
              <Form form={loginForm} layout="vertical" onFinish={doLogin}>
                <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
                  <Input autoComplete="username" />
                </Form.Item>
                <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}>
                  <Input.Password autoComplete="current-password" />
                </Form.Item>
                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    使用演示账号可直接体验管理功能
                  </Typography.Text>
                  <Button type="primary" htmlType="submit" loading={loading}>
                    登录
                  </Button>
                </Space>
              </Form>
            )
          },
          {
            key: 'register',
            label: '注册',
            children: (
              <Form form={registerForm} layout="vertical" onFinish={doRegister}>
                <Form.Item
                  name="username"
                  label="用户名"
                  rules={[
                    { required: true, message: '请输入用户名' },
                    { min: 3, max: 60, message: '用户名长度需为3-60' }
                  ]}
                >
                  <Input autoComplete="username" />
                </Form.Item>
                <Form.Item
                  name="password"
                  label="密码"
                  rules={[
                    { required: true, message: '请输入密码' },
                    { min: 6, max: 100, message: '密码长度需为6-100' }
                  ]}
                >
                  <Input.Password autoComplete="new-password" />
                </Form.Item>
                <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
                  <Button type="primary" htmlType="submit" loading={loading}>
                    注册
                  </Button>
                </Space>
              </Form>
            )
          }
        ]}
      />
    </Modal>
  );
}

