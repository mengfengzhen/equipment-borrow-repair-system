import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Empty, Form, Input, Modal, Popconfirm, Space, Spin, Tag, Typography, message } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { http } from '../api/http';
import { DeviceDictionaryGroup, DeviceDictionaryItem } from '../types/deviceDictionary';

type DictionaryFormValues = {
  value: string;
  brand?: string;
  model?: string;
  bulkText?: string;
};

type BrandNode = {
  value: string;
  used: boolean;
  usageCount: number;
  models: DeviceDictionaryItem[];
};

type ModalState =
  | { kind: 'type-create' }
  | { kind: 'type-edit'; item: DeviceDictionaryItem }
  | { kind: 'brand-create'; type: string }
  | { kind: 'brand-edit'; type: string; brand: BrandNode }
  | { kind: 'model-create'; type: string; brand: string }
  | { kind: 'model-edit'; item: DeviceDictionaryItem }
  | { kind: 'location-create' }
  | { kind: 'location-edit'; item: DeviceDictionaryItem }
  | { kind: 'bulk-create' };

export function DeviceDictionariesPage() {
  const [groups, setGroups] = useState<DeviceDictionaryGroup[]>([]);
  const [selectedType, setSelectedType] = useState<string>();
  const [selectedBrand, setSelectedBrand] = useState<string>();
  const [typeKeyword, setTypeKeyword] = useState('');
  const [brandKeyword, setBrandKeyword] = useState('');
  const [modelKeyword, setModelKeyword] = useState('');
  const [locationKeyword, setLocationKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState<ModalState>();
  const [form] = Form.useForm<DictionaryFormValues>();

  const typeItems = useMemo(() => getGroup(groups, 'type'), [groups]);
  const brandItems = useMemo(() => getGroup(groups, 'brand'), [groups]);
  const typeBrandItems = useMemo(() => getGroup(groups, 'typeBrand'), [groups]);
  const modelItems = useMemo(() => getGroup(groups, 'model'), [groups]);
  const locationItems = useMemo(() => getGroup(groups, 'location'), [groups]);

  const filteredTypes = useMemo(
    () => filterByKeyword(typeItems, typeKeyword),
    [typeItems, typeKeyword],
  );

  const brandsForSelectedType = useMemo(() => {
    if (!selectedType) return [];
    return typeBrandItems
      .filter((item) => item.type === selectedType)
      .map((item) => ({
        value: item.value,
        used: item.used,
        usageCount: item.usageCount,
        models: modelItems.filter((model) => model.type === item.type && model.brand === item.value),
      }))
      .sort((a, b) => a.value.localeCompare(b.value, 'zh-Hans-CN'));
  }, [modelItems, selectedType, typeBrandItems]);

  const filteredBrands = useMemo(
    () => filterByKeyword(brandsForSelectedType, brandKeyword),
    [brandsForSelectedType, brandKeyword],
  );

  const modelsForSelectedBrand = useMemo(() => {
    if (!selectedType || !selectedBrand) return [];
    return modelItems
      .filter((item) => item.type === selectedType && item.brand === selectedBrand)
      .sort((a, b) => a.value.localeCompare(b.value, 'zh-Hans-CN'));
  }, [modelItems, selectedBrand, selectedType]);

  const filteredModels = useMemo(
    () => filterByKeyword(modelsForSelectedBrand, modelKeyword),
    [modelsForSelectedBrand, modelKeyword],
  );

  const filteredLocations = useMemo(
    () => filterByKeyword(locationItems, locationKeyword),
    [locationItems, locationKeyword],
  );

  const load = async () => {
    setLoading(true);
    try {
      const result = await http.get('/devices/dictionaries') as unknown as DeviceDictionaryGroup[];
      setGroups(result);
      const types = getGroup(result, 'type');
      const typeBrands = getGroup(result, 'typeBrand');
      const nextType = selectedType && types.some((item) => item.value === selectedType)
        ? selectedType
        : types[0]?.value;
      const brands = nextType
        ? typeBrands.filter((item) => item.type === nextType).map((item) => item.value)
        : [];
      const nextBrand = selectedBrand && brands.includes(selectedBrand) ? selectedBrand : brands[0];
      setSelectedType(nextType);
      setSelectedBrand(nextBrand);
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openModal = (nextModal: ModalState) => {
    setModal(nextModal);
    form.resetFields();
    if ('item' in nextModal) {
      form.setFieldsValue({ value: nextModal.item.value });
    }
    if (nextModal.kind === 'brand-edit') {
      form.setFieldsValue({ brand: nextModal.brand.value });
    }
  };

  const closeModal = () => {
    setModal(undefined);
    form.resetFields();
  };

  const submit = async () => {
    if (!modal) return;
    const values = await form.validateFields();
    setSaving(true);
    try {
      if (modal.kind === 'type-create') {
        await http.post('/devices/dictionaries/type', { value: values.value });
        setSelectedType(values.value.trim());
        setSelectedBrand(undefined);
      }
      if (modal.kind === 'type-edit') {
        await http.patch('/devices/dictionaries/type', { oldValue: modal.item.value, value: values.value });
        setSelectedType(values.value.trim());
      }
      if (modal.kind === 'brand-create') {
        const brand = await ensureBrandExists(values.brand || '');
        await http.post('/devices/dictionaries/typeBrand', {
          type: modal.type,
          value: brand,
        });
        setSelectedBrand(brand);
      }
      if (modal.kind === 'brand-edit') {
        const nextBrand = await ensureBrandExists(values.brand || '');
        await http.patch('/devices/dictionaries/typeBrand', {
          oldType: modal.type,
          oldValue: modal.brand.value,
          type: modal.type,
          value: nextBrand,
        });
        setSelectedBrand(nextBrand);
      }
      if (modal.kind === 'model-create') {
        await http.post('/devices/dictionaries/model', {
          type: modal.type,
          brand: modal.brand,
          value: values.value,
        });
      }
      if (modal.kind === 'model-edit') {
        await http.patch('/devices/dictionaries/model', {
          oldType: modal.item.type,
          oldBrand: modal.item.brand,
          oldValue: modal.item.value,
          type: modal.item.type,
          brand: modal.item.brand,
          value: values.value,
        });
      }
      if (modal.kind === 'location-create') {
        await http.post('/devices/dictionaries/location', { value: values.value });
      }
      if (modal.kind === 'location-edit') {
        await http.patch('/devices/dictionaries/location', { oldValue: modal.item.value, value: values.value });
      }
      if (modal.kind === 'bulk-create') {
        const rows = parseBulkModelRows(values.bulkText || '');
        if (!rows.length) {
          throw new Error('请输入要新增的设备类型、品牌、型号');
        }
        await createModelRows(rows);
        const [lastRow] = rows.slice(-1);
        setSelectedType(lastRow.type);
        setSelectedBrand(lastRow.brand);
      }
      message.success('字典已更新');
      closeModal();
      await load();
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const createModelRows = async (rows: Array<{ type: string; brand: string; model: string }>) => {
    const existingTypes = new Set(typeItems.map((item) => item.value));
    const existingBrands = new Set(brandItems.map((item) => item.value));
    const existingTypeBrands = new Set(typeBrandItems.map((item) => buildModelKey(item.type, undefined, item.value)));
    const existingModels = new Set(modelItems.map((item) => buildModelKey(item.type, item.brand, item.value)));

    for (const row of rows) {
      if (!existingTypes.has(row.type)) {
        await http.post('/devices/dictionaries/type', { value: row.type });
        existingTypes.add(row.type);
      }
      if (!existingBrands.has(row.brand)) {
        await http.post('/devices/dictionaries/brand', { value: row.brand });
        existingBrands.add(row.brand);
      }
      const typeBrandKey = buildModelKey(row.type, undefined, row.brand);
      if (!existingTypeBrands.has(typeBrandKey)) {
        await http.post('/devices/dictionaries/typeBrand', { type: row.type, value: row.brand });
        existingTypeBrands.add(typeBrandKey);
      }
      const modelKey = buildModelKey(row.type, row.brand, row.model);
      if (!existingModels.has(modelKey)) {
        await http.post('/devices/dictionaries/model', {
          type: row.type,
          brand: row.brand,
          value: row.model,
        });
        existingModels.add(modelKey);
      }
    }
  };

  const ensureBrandExists = async (brand: string) => {
    const value = brand.trim();
    if (!value) {
      throw new Error('请输入品牌');
    }
    if (brandItems.some((item) => item.value === value)) {
      return value;
    }
    await http.post('/devices/dictionaries/brand', { value });
    return value;
  };

  const removeType = async (item: DeviceDictionaryItem) => {
    await removeDictionaryValue('/devices/dictionaries/type', { value: item.value }, '设备类型已删除');
    if (selectedType === item.value) {
      setSelectedType(undefined);
      setSelectedBrand(undefined);
    }
  };

  const removeBrand = async (brand: BrandNode) => {
    await removeDictionaryValue('/devices/dictionaries/typeBrand', {
      type: selectedType,
      value: brand.value,
    }, '该类型下的品牌关系已删除');
    if (selectedBrand === brand.value) setSelectedBrand(undefined);
  };

  const removeModel = async (item: DeviceDictionaryItem) => {
    await removeDictionaryValue('/devices/dictionaries/model', {
      type: item.type,
      brand: item.brand,
      value: item.value,
    }, '型号已删除');
  };

  const removeLocation = async (item: DeviceDictionaryItem) => {
    await removeDictionaryValue('/devices/dictionaries/location', { value: item.value }, '存放地点已删除');
  };

  const removeDictionaryValue = async (url: string, params: Record<string, string | undefined>, success: string) => {
    try {
      setSaving(true);
      await http.delete(url, { params });
      message.success(success);
      await load();
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const selectedTypeItem = typeItems.find((item) => item.value === selectedType);
  const selectedBrandNode = brandsForSelectedType.find((item) => item.value === selectedBrand);

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <h1 className="page-title">设备字段管理</h1>
          <Typography.Text type="secondary">
            按设备类型管理品牌和型号。品牌可先挂到设备类型下，型号再挂到具体品牌下，设备入库和 CSV 导入按完整组合校验。
          </Typography.Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal({ kind: 'bulk-create' })}>
          批量新增
        </Button>
      </div>

      <Spin spinning={loading || saving}>
        <div className="dictionary-tree-grid">
          <section className="content-card dictionary-panel">
            <DictionaryPanelHeader
              title="设备类型"
              count={typeItems.length}
              buttonText="新增类型"
              onAdd={() => openModal({ kind: 'type-create' })}
            />
            <Input.Search
              allowClear
              placeholder="搜索设备类型"
              value={typeKeyword}
              onChange={(event) => setTypeKeyword(event.target.value)}
            />
            <div className="dictionary-list">
              {filteredTypes.map((item) => (
                <DictionaryRow
                  key={item.value}
                  active={item.value === selectedType}
                  title={item.value}
                  used={item.used}
                  usageCount={item.usageCount}
                  onClick={() => {
                    setSelectedType(item.value);
                    const nextBrand = typeBrandItems.find((brand) => brand.type === item.value)?.value;
                    setSelectedBrand(nextBrand);
                  }}
                  onEdit={() => openModal({ kind: 'type-edit', item })}
                  onDelete={() => removeType(item)}
                  deleteTitle="确认删除设备类型？"
                  deleteDescription="删除前需要先删除该类型下的品牌和型号，且不能被设备使用。"
                />
              ))}
              {!filteredTypes.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无设备类型" />}
            </div>
          </section>

          <section className="content-card dictionary-panel">
            <DictionaryPanelHeader
              title={selectedType ? `${selectedType} 下的品牌` : '品牌'}
              count={brandsForSelectedType.length}
              buttonText="新增品牌"
              disabled={!selectedType}
              onAdd={() => selectedType && openModal({ kind: 'brand-create', type: selectedType })}
            />
            <Input.Search
              allowClear
              placeholder="搜索品牌"
              value={brandKeyword}
              onChange={(event) => setBrandKeyword(event.target.value)}
              disabled={!selectedType}
            />
            <div className="dictionary-list">
              {selectedType && filteredBrands.map((brand) => (
                <DictionaryRow
                  key={brand.value}
                  active={brand.value === selectedBrand}
                  title={brand.value}
                  subtitle={`${brand.models.length} 个型号`}
                  used={brand.used}
                  usageCount={brand.usageCount}
                  onClick={() => setSelectedBrand(brand.value)}
                  onEdit={() => selectedType && openModal({ kind: 'brand-edit', type: selectedType, brand })}
                  onDelete={() => removeBrand(brand)}
                  deleteTitle="确认删除该类型下的品牌关系？"
                  deleteDescription="会删除该类型和品牌下所有未使用型号；已被设备使用时不能删除。"
                />
              ))}
              {selectedType && !filteredBrands.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="该类型下暂无品牌" />}
              {!selectedType && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="请先选择设备类型" />}
            </div>
          </section>

          <section className="content-card dictionary-panel">
            <DictionaryPanelHeader
              title={selectedType && selectedBrand ? `${selectedBrand} 型号` : '型号'}
              count={modelsForSelectedBrand.length}
              buttonText="新增型号"
              disabled={!selectedType || !selectedBrand}
              onAdd={() => selectedType && selectedBrand && openModal({ kind: 'model-create', type: selectedType, brand: selectedBrand })}
            />
            <Input.Search
              allowClear
              placeholder="搜索型号"
              value={modelKeyword}
              onChange={(event) => setModelKeyword(event.target.value)}
              disabled={!selectedBrand}
            />
            <div className="dictionary-list">
              {selectedBrand && filteredModels.map((item) => (
                <DictionaryRow
                  key={`${item.type}::${item.brand}::${item.value}`}
                  title={item.value}
                  used={item.used}
                  usageCount={item.usageCount}
                  onEdit={() => openModal({ kind: 'model-edit', item })}
                  onDelete={() => removeModel(item)}
                  deleteTitle="确认删除型号？"
                  deleteDescription="删除后新增设备和 CSV 导入将不能再使用该组合。"
                />
              ))}
              {selectedBrand && !filteredModels.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="该品牌下暂无型号" />}
              {!selectedBrand && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="请先选择品牌" />}
            </div>
          </section>
        </div>

        <section className="content-card dictionary-panel dictionary-location-panel">
          <DictionaryPanelHeader
            title="存放地点"
            count={locationItems.length}
            buttonText="新增地点"
            onAdd={() => openModal({ kind: 'location-create' })}
          />
          <Input.Search
            allowClear
            placeholder="搜索存放地点"
            value={locationKeyword}
            onChange={(event) => setLocationKeyword(event.target.value)}
          />
          <div className="dictionary-location-list">
            {filteredLocations.map((item) => (
              <DictionaryRow
                key={item.value}
                title={item.value}
                used={item.used}
                usageCount={item.usageCount}
                onEdit={() => openModal({ kind: 'location-edit', item })}
                onDelete={() => removeLocation(item)}
                deleteTitle="确认删除存放地点？"
                deleteDescription="删除后新增设备和 CSV 导入将不能再使用该地点。"
              />
            ))}
            {!filteredLocations.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无存放地点" />}
          </div>
        </section>
      </Spin>

      <Modal
        title={getModalTitle(modal, selectedTypeItem, selectedBrandNode)}
        open={Boolean(modal)}
        onCancel={closeModal}
        onOk={submit}
        confirmLoading={saving}
        okText="保存"
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          {modal?.kind === 'brand-create' && (
            <Form.Item
              name="brand"
              label="品牌"
              rules={[{ required: true, whitespace: true, message: '请输入品牌' }]}
              extra="可填写已有品牌，也可填写新品牌。保存后会建立当前设备类型和品牌的关系。"
            >
              <Input placeholder="请输入品牌" />
            </Form.Item>
          )}
          {modal?.kind === 'brand-edit' && (
            <Form.Item
              name="brand"
              label="品牌"
              rules={[{ required: true, whitespace: true, message: '请输入品牌' }]}
            >
              <Input placeholder="请输入品牌" />
            </Form.Item>
          )}
          {modal?.kind === 'bulk-create' && (
            <Form.Item
              name="bulkText"
              label="设备类型 / 品牌 / 型号"
              rules={[{ required: true, whitespace: true, message: '请输入要新增的内容' }]}
              extra="一行一个组合，支持逗号、斜杠、竖线或 Tab 分隔。例如：测试机,Apple,TestPhone-01"
            >
              <Input.TextArea
                rows={8}
                placeholder={'测试机,Apple,TestPhone-01\n测试机,Xiaomi,TestPhone-02\n摄影器材 / Sony / A7M4'}
              />
            </Form.Item>
          )}
          {modal && !['brand-create', 'brand-edit', 'bulk-create'].includes(modal.kind) && (
            <Form.Item
              name="value"
              label={getValueLabel(modal)}
              rules={[{ required: true, whitespace: true, message: `请输入${getValueLabel(modal)}` }]}
            >
              <Input placeholder={`请输入${getValueLabel(modal)}`} />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
}

function DictionaryPanelHeader({
  title,
  count,
  buttonText,
  disabled,
  onAdd,
}: {
  title: string;
  count: number;
  buttonText: string;
  disabled?: boolean;
  onAdd: () => void;
}) {
  return (
    <div className="dictionary-panel-header">
      <div>
        <Typography.Title level={5}>{title}</Typography.Title>
        <Typography.Text type="secondary">共 {count} 项</Typography.Text>
      </div>
      <Button type="primary" icon={<PlusOutlined />} disabled={disabled} onClick={onAdd}>
        {buttonText}
      </Button>
    </div>
  );
}

function DictionaryRow({
  title,
  subtitle,
  active,
  used,
  usageCount,
  onClick,
  onEdit,
  onDelete,
  deleteTitle,
  deleteDescription,
}: {
  title: string;
  subtitle?: string;
  active?: boolean;
  used: boolean;
  usageCount: number;
  onClick?: () => void;
  onEdit: () => void;
  onDelete: () => void;
  deleteTitle: string;
  deleteDescription: string;
}) {
  return (
    <div className={active ? 'dictionary-row is-active' : 'dictionary-row'}>
      <button type="button" className="dictionary-row-main" onClick={onClick}>
        <span>{title}</span>
        {subtitle && <Typography.Text type="secondary">{subtitle}</Typography.Text>}
      </button>
      <Tag color={used ? 'green' : undefined}>{used ? `已使用 ${usageCount}` : '未使用'}</Tag>
      <Space size={4}>
        <Button size="small" icon={<EditOutlined />} disabled={used} onClick={onEdit} />
        <Popconfirm
          title={deleteTitle}
          description={deleteDescription}
          okText="删除"
          cancelText="取消"
          okButtonProps={{ danger: true }}
          disabled={used}
          onConfirm={onDelete}
        >
          <Button size="small" icon={<DeleteOutlined />} danger disabled={used} />
        </Popconfirm>
      </Space>
    </div>
  );
}

function getGroup(groups: DeviceDictionaryGroup[], field: DeviceDictionaryGroup['field']) {
  return groups.find((item) => item.field === field)?.items || [];
}

function filterByKeyword<T extends { value: string }>(items: T[], keyword: string) {
  const normalized = keyword.trim().toLowerCase();
  if (!normalized) return items;
  return items.filter((item) => item.value.toLowerCase().includes(normalized));
}

function parseBulkModelRows(text: string) {
  return text
    .split(/\r?\n/)
    .map((line, index) => {
      const parts = line
        .split(/\t|,|，|\/|／|\||｜/)
        .map((item) => item.trim())
        .filter(Boolean);
      if (!parts.length) return undefined;
      if (parts.length < 3) {
        throw new Error(`第 ${index + 1} 行格式不正确，请填写：设备类型,品牌,型号`);
      }
      return {
        type: parts[0],
        brand: parts[1],
        model: parts.slice(2).join(' / '),
      };
    })
    .filter((item): item is { type: string; brand: string; model: string } => Boolean(item));
}

function buildModelKey(type?: string, brand?: string, model?: string) {
  return `${type || ''}::${brand || ''}::${model || ''}`;
}

function getValueLabel(modal?: ModalState) {
  if (!modal) return '字典值';
  if (modal.kind.startsWith('type')) return '设备类型';
  if (modal.kind.startsWith('model')) return '型号';
  if (modal.kind.startsWith('location')) return '存放地点';
  return '字典值';
}

function getModalTitle(modal?: ModalState, selectedType?: DeviceDictionaryItem, selectedBrand?: BrandNode) {
  if (!modal) return '';
  if (modal.kind === 'type-create') return '新增设备类型';
  if (modal.kind === 'type-edit') return '编辑设备类型';
  if (modal.kind === 'brand-create') return `在「${modal.type}」下新增品牌`;
  if (modal.kind === 'brand-edit') return `编辑「${modal.type}」下的品牌`;
  if (modal.kind === 'model-create') return `在「${modal.type} / ${modal.brand}」下新增型号`;
  if (modal.kind === 'model-edit') return `编辑「${modal.item.type} / ${modal.item.brand}」下的型号`;
  if (modal.kind === 'location-create') return '新增存放地点';
  if (modal.kind === 'location-edit') return '编辑存放地点';
  if (modal.kind === 'bulk-create') return '批量新增设备字段';
  return selectedBrand?.value || selectedType?.value || '';
}
