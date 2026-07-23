import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { Button, Card, Drawer, List, Space, Tabs, Tag, Typography } from 'antd';
import { EyeOutlined, PlayCircleOutlined } from '@ant-design/icons';

export default function InterpretationsPage() {
  const [type, setType] = useState('video');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState({ total: 0, data: [] });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [current, setCurrent] = useState(null);

  const load = async nextType => {
    setLoading(true);
    try {
      const res = await api.listInterpretations({ type: nextType, page: 1, pageSize: 50 });
      setData(res);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(type);
  }, [type]);

  const openItem = async id => {
    setLoading(true);
    try {
      const res = await api.getInterpretation(id);
      setCurrent(res);
      setDrawerOpen(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={16}>
      <Card bordered={false} title="标准解读服务">
        <Tabs
          activeKey={type}
          onChange={k => setType(k)}
          items={[
            { key: 'video', label: '视频解读' },
            { key: 'article', label: '图文解读' }
          ]}
        />
        <List
          loading={loading}
          dataSource={data.data}
          renderItem={item => (
            <List.Item
              actions={[
                item.type === 'video' ? (
                  <Button
                    key="watch"
                    type="primary"
                    icon={<PlayCircleOutlined />}
                    onClick={() => window.open(item.video_url, '_blank', 'noopener,noreferrer')}
                  >
                    立即观看
                  </Button>
                ) : (
                  <Button key="read" icon={<EyeOutlined />} onClick={() => openItem(item.id)}>
                    立即阅读
                  </Button>
                )
              ]}
            >
              <List.Item.Meta
                title={
                  <Space wrap>
                    <Typography.Text strong>{item.title}</Typography.Text>
                    <Tag color={item.type === 'video' ? 'purple' : 'geekblue'}>{item.type === 'video' ? '视频' : '图文'}</Tag>
                    {item.file?.code ? <Tag>{item.file.code}</Tag> : null}
                    {item.expert_name ? <Tag>{item.expert_name}</Tag> : null}
                    {item.duration ? <Tag>{item.duration}</Tag> : null}
                  </Space>
                }
                description={
                  <Space wrap>
                    {item.clause_ref ? <Tag color="default">{item.clause_ref}</Tag> : null}
                    {item.tags ? <Typography.Text type="secondary">{item.tags}</Typography.Text> : null}
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      </Card>

      <Drawer
        title={current?.title || '图文解读'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={860}
        destroyOnClose
      >
        {current ? (
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <Space wrap>
              <Tag color="geekblue">图文</Tag>
              {current.file?.name ? <Tag>{current.file.name}</Tag> : null}
              {current.expert_name ? <Tag>{current.expert_name}</Tag> : null}
              {current.expert_title ? <Tag>{current.expert_title}</Tag> : null}
            </Space>
            <Typography.Paragraph style={{ whiteSpace: 'pre-wrap' }}>{current.content || ''}</Typography.Paragraph>
          </Space>
        ) : null}
      </Drawer>
    </Space>
  );
}
