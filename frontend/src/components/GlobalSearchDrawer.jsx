import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { Input, List, Space, Tag, Typography, Segmented, Button } from 'antd';
import { FileTextOutlined, PlayCircleOutlined, QuestionCircleOutlined, SearchOutlined } from '@ant-design/icons';

export default function GlobalSearchDrawer({ initialQuery }) {
  const [q, setQ] = useState(initialQuery || '');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState({ files: [], interpretations: [], faqs: [] });
  const [tab, setTab] = useState('文件');

  const items = useMemo(() => {
    if (tab === '文件') return data.files || [];
    if (tab === '解读') return data.interpretations || [];
    return data.faqs || [];
  }, [data, tab]);

  const run = async valueOverride => {
    const value = ((valueOverride ?? q) || '').trim();
    if (!value) return;
    setLoading(true);
    try {
      setData(await api.globalSearch(value));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!initialQuery) return;
    setQ(initialQuery);
    run(initialQuery);
  }, [initialQuery]);

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={16}>
      <Space.Compact style={{ width: '100%' }}>
        <Input
          value={q}
          onChange={e => setQ(e.target.value)}
          onPressEnter={run}
          placeholder="输入关键词，例如：分类分级 / 数据安全 / 行动计划"
          prefix={<SearchOutlined />}
        />
        <Button type="primary" onClick={run} loading={loading}>
          搜索
        </Button>
      </Space.Compact>

      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { label: '文件', value: '文件', icon: <FileTextOutlined /> },
          { label: '解读', value: '解读', icon: <PlayCircleOutlined /> },
          { label: '问题', value: '问题', icon: <QuestionCircleOutlined /> }
        ]}
      />

      <List
        loading={loading}
        dataSource={items}
        renderItem={item => {
          if (tab === '文件') {
            return (
              <List.Item
                actions={[
                  <Button
                    key="open"
                    type="link"
                    onClick={() => window.open(`/api/files/${item.id}/view`, '_blank', 'noopener,noreferrer')}
                  >
                    打开
                  </Button>
                ]}
              >
                <List.Item.Meta
                  title={
                    <Space wrap>
                      <Typography.Text strong>{item.name}</Typography.Text>
                      <Tag color="blue">{item.code}</Tag>
                      <Tag>{item.category_level1}</Tag>
                      <Tag>{item.status}</Tag>
                    </Space>
                  }
                />
              </List.Item>
            );
          }

          if (tab === '解读') {
            return (
              <List.Item
                actions={[
                  <Button
                    key="watch"
                    type="link"
                    onClick={() => window.open(item.video_url || `/api/interpretations/${item.id}`, '_blank', 'noopener,noreferrer')}
                  >
                    立即观看
                  </Button>
                ]}
              >
                <List.Item.Meta
                  title={
                    <Space wrap>
                      <Typography.Text strong>{item.title}</Typography.Text>
                      <Tag color={item.type === 'video' ? 'purple' : 'geekblue'}>{item.type === 'video' ? '视频' : '图文'}</Tag>
                      {item.expert_name ? <Tag>{item.expert_name}</Tag> : null}
                    </Space>
                  }
                />
              </List.Item>
            );
          }

          return (
            <List.Item
              actions={[
                <Button
                  key="open"
                  type="link"
                  onClick={() => window.open(`/api/faqs/${item.id}`, '_blank', 'noopener,noreferrer')}
                >
                  查看JSON
                </Button>
              ]}
            >
              <List.Item.Meta
                title={
                  <Space wrap>
                    <Typography.Text strong>{item.question}</Typography.Text>
                    <Tag color="gold">{item.category}</Tag>
                  </Space>
                }
              />
            </List.Item>
          );
        }}
      />
    </Space>
  );
}
