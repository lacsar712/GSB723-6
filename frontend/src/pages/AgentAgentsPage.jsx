import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Form, Input, InputNumber, Modal, Select, Space, Table, Typography } from 'antd';
import { PlusOutlined, NodeIndexOutlined, ReloadOutlined, EditOutlined } from '@ant-design/icons';
import { api } from '../lib/api.js';
import { useNavigate } from 'react-router-dom';

export default function AgentAgentsPage({ agent, onRefresh }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [children, setChildren] = useState([]);
  const [apps, setApps] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editingAgent, setEditingAgent] = useState(null);
  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();

  const appOptions = useMemo(() => {
    return (apps || []).map(a => ({ label: a.name, value: a.id }));
  }, [apps]);

  async function reload() {
    setLoading(true);
    try {
      const [appsData, childrenData] = await Promise.all([api.listApps(), api.listChildrenAgents()]);
      setApps(appsData);
      setChildren(childrenData);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  const columns = [
    {
      title: '代理账号',
      dataIndex: 'name',
      key: 'name',
      render: (v, row) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{v}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            ID: {row.id} · 上级: {row.parent_id ?? '-'}
          </Typography.Text>
        </Space>
      )
    },
    { title: '优先级', dataIndex: 'priority', key: 'priority', width: 90 },
    {
      title: '绑定应用',
      dataIndex: 'application',
      key: 'application',
      render: app => (app?.name ? app.name : <Typography.Text type="secondary">未绑定</Typography.Text>)
    },
    { title: '卡密额度', dataIndex: 'card_quota_total', key: 'card_quota_total', width: 110 },
    { title: '已用', dataIndex: 'card_quota_used', key: 'card_quota_used', width: 90 },
    { title: '预留', dataIndex: 'card_quota_reserved', key: 'card_quota_reserved', width: 90 },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: v => (v ? new Date(v).toLocaleString() : '-')
    },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      render: (_, row) => (
        <Button
          size="small"
          icon={<EditOutlined />}
          style={{ borderRadius: 10 }}
          onClick={() => {
            setEditingAgent(row);
            editForm.setFieldsValue({
              name: row.name,
              password: undefined,
              priority: row.priority,
              card_quota_total: row.card_quota_total,
              application_id: row.application_id ?? null
            });
            setEditOpen(true);
          }}
        >
          编辑
        </Button>
      )
    }
  ];

  const remaining = agent.card_quota_total - agent.card_quota_used - agent.card_quota_reserved;

  return (
    <Space direction="vertical" size={14} style={{ width: '100%' }}>
      <Card
        bordered={false}
        style={{
          borderRadius: 16,
          boxShadow: '0 12px 30px rgba(0,0,0,0.06)',
          background: 'rgba(255,255,255,0.75)',
          backdropFilter: 'blur(16px)'
        }}
      >
        <Space style={{ width: '100%', justifyContent: 'space-between', flexWrap: 'wrap' }} size={12}>
          <Space direction="vertical" size={2}>
            <Typography.Title level={4} style={{ margin: 0 }}>
              代理管理
            </Typography.Title>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              当前账号可用额度：{remaining}
            </Typography.Text>
          </Space>
          <Space size={10} style={{ flexWrap: 'wrap' }}>
            <Button icon={<NodeIndexOutlined />} onClick={() => navigate('/agent/hierarchy')} style={{ borderRadius: 12 }}>
              查看上下级
            </Button>
            <Button icon={<ReloadOutlined />} onClick={() => reload()} style={{ borderRadius: 12 }}>
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)} style={{ borderRadius: 12 }}>
              新建代理
            </Button>
          </Space>
        </Space>
      </Card>

      <Card
        bordered={false}
        style={{
          borderRadius: 16,
          boxShadow: '0 12px 30px rgba(0,0,0,0.06)',
          background: 'rgba(255,255,255,0.72)',
          backdropFilter: 'blur(16px)'
        }}
      >
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={children}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      <Modal
        title="创建新代理"
        open={createOpen}
        onCancel={() => {
          setCreateOpen(false);
          createForm.resetFields();
        }}
        okText="创建"
        cancelText="取消"
        confirmLoading={creating}
        onOk={() => createForm.submit()}
        destroyOnClose
      >
        <Form
          form={createForm}
          layout="vertical"
          onFinish={async (values) => {
            setCreating(true);
            try {
              await api.createChildAgent(values);
              setCreateOpen(false);
              createForm.resetFields();
              await Promise.all([reload(), onRefresh?.()]);
            } finally {
              setCreating(false);
            }
          }}
          initialValues={{ priority: 0, card_quota_total: 0, application_id: null }}
        >
          <Form.Item
            name="name"
            label="账号名"
            rules={[
              { required: true, message: '请输入账号名' },
              { min: 2, max: 80, message: '账号名长度需为2-80' }
            ]}
          >
            <Input placeholder="例如：agent-a" />
          </Form.Item>

          <Form.Item
            name="password"
            label="密码"
            rules={[{ required: true, message: '请输入密码' }, { min: 6, message: '密码至少6位' }]}
          >
            <Input.Password placeholder="至少6位" />
          </Form.Item>

          <Space size={12} style={{ width: '100%' }}>
            <Form.Item
              name="priority"
              label="优先级"
              style={{ flex: 1 }}
              rules={[{ required: true, message: '请输入优先级' }]}
            >
              <InputNumber style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              name="card_quota_total"
              label="卡密额度"
              style={{ flex: 1 }}
              rules={[{ required: true, message: '请输入卡密额度' }]}
            >
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </Space>

          <Form.Item name="application_id" label="绑定应用">
            <Select allowClear placeholder="可不绑定" options={appOptions} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingAgent ? `编辑代理：${editingAgent.name}` : '编辑代理'}
        open={editOpen}
        onCancel={() => {
          setEditOpen(false);
          setEditingAgent(null);
          editForm.resetFields();
        }}
        okText="保存"
        cancelText="取消"
        confirmLoading={editing}
        onOk={() => editForm.submit()}
        destroyOnClose
      >
        <Form
          form={editForm}
          layout="vertical"
          onFinish={async (values) => {
            if (!editingAgent) return;
            setEditing(true);
            try {
              await api.updateChildAgent(editingAgent.id, {
                ...values,
                application_id: values.application_id ?? null,
                password: values.password?.trim() || undefined
              });
              setEditOpen(false);
              setEditingAgent(null);
              editForm.resetFields();
              await Promise.all([reload(), onRefresh?.()]);
            } finally {
              setEditing(false);
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
            <Input placeholder="例如：agent-a" />
          </Form.Item>

          <Form.Item
            name="password"
            label="新密码"
            rules={[{ min: 6, message: '密码至少6位' }]}
          >
            <Input.Password placeholder="留空表示不修改" />
          </Form.Item>

          <Space size={12} style={{ width: '100%' }}>
            <Form.Item
              name="priority"
              label="优先级"
              style={{ flex: 1 }}
              rules={[{ required: true, message: '请输入优先级' }]}
            >
              <InputNumber style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              name="card_quota_total"
              label="卡密额度"
              style={{ flex: 1 }}
              rules={[{ required: true, message: '请输入卡密额度' }]}
            >
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </Space>

          <Form.Item name="application_id" label="绑定应用">
            <Select allowClear placeholder="可不绑定" options={appOptions} />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
