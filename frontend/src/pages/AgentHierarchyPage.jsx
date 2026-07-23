import React, { useEffect, useMemo, useState } from 'react';
import { Breadcrumb, Card, Space, Spin, Tree, Typography } from 'antd';
import { api } from '../lib/api.js';

function toTreeData(node) {
  if (!node) return [];
  const title = (
    <Space size={10} style={{ width: '100%', justifyContent: 'space-between' }}>
      <Typography.Text strong>{node.name}</Typography.Text>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        优先级 {node.priority} · 额度 {node.card_quota_total} · 已用 {node.card_quota_used} · 预留 {node.card_quota_reserved}
      </Typography.Text>
    </Space>
  );
  return [
    {
      key: String(node.id),
      title,
      children: (node.children || []).flatMap(toTreeData)
    }
  ];
}

export default function AgentHierarchyPage() {
  const [loading, setLoading] = useState(true);
  const [hierarchy, setHierarchy] = useState(null);

  useEffect(() => {
    setLoading(true);
    api
      .getHierarchy()
      .then(setHierarchy)
      .finally(() => setLoading(false));
  }, []);

  const breadcrumbItems = useMemo(() => {
    const chain = hierarchy?.chain || [];
    return chain.map(a => ({ title: a.name }));
  }, [hierarchy]);

  const treeData = useMemo(() => {
    return toTreeData(hierarchy?.tree);
  }, [hierarchy]);

  if (loading) {
    return (
      <div style={{ padding: 50, display: 'flex', justifyContent: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

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
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Typography.Title level={4} style={{ margin: 0 }}>
            上下级树状关系
          </Typography.Title>
          <Breadcrumb items={breadcrumbItems} />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            链路展示当前账号到顶级上级；树状展示当前账号的下级代理结构。
          </Typography.Text>
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
        <Tree
          showLine
          defaultExpandAll
          treeData={treeData}
          style={{ paddingBlock: 6 }}
        />
      </Card>
    </Space>
  );
}

