import React, { useCallback, useRef, useEffect, useState } from 'react';
import {
  ReactFlow,
  Background,
  useNodesState,
  useEdgesState,
  useReactFlow,
  addEdge,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import SystemComponentNode from '../nodes/SystemComponentNode';
import DbTableNode from '../nodes/DbTableNode';
import ApiEndpointNode from '../nodes/ApiEndpointNode';
import AnimatedEdge from '../edges/AnimatedEdge';
import StatusBar from '../statusbar/StatusBar';
import ContextMenu from '../menu/ContextMenu';
import useStore from '../../store/useStore';
import ArchitectureSummaryBar from '../summary/ArchitectureSummaryBar';
import LayerFilterBar from './LayerFilterBar';
import FlowSimulator from './FlowSimulator';
import { applyHierarchicalLayout, applyRadialLayout, applyGridLayout } from '../../utils/layoutUtils';
import './AgentCanvas.css';

import {
  Database as DbIcon, Globe, Network, Loader2, FileText, Code, Save,
  Trash2, Clock, MousePointer, Sparkles, Download, Eye, Edit3,
  X, Zap, Play, Square, Check, Hand, Maximize2, Layers,
  Plus, Type, Shield
} from 'lucide-react';

const nodeTypes = { systemComponentNode: SystemComponentNode, dbTableNode: DbTableNode, apiEndpointNode: ApiEndpointNode };
const edgeTypes = { animated: AnimatedEdge };

const SQL_SCHEMA = (tables) => tables.map((t) => {
  const cols = (t.columns || []).map((c) => `  ${c.name} ${c.type.toUpperCase()}${c.constraint ? ` ${c.constraint.toUpperCase()}` : ''}`);
  return `CREATE TABLE ${t.name} (\n${cols.join(',\n')}\n);\n`;
}).join('\n');

const VIEW_TABS = [
  { id: 'system',    label: 'System Context', Icon: Network,  color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)' },
  { id: 'cloud',     label: 'Cloud View',     Icon: Globe,    color: '#0ea5e9', bg: 'rgba(14,165,233,0.1)' },
  { id: 'security',  label: 'Security View',  Icon: Shield,   color: '#f43f5e', bg: 'rgba(244,63,94,0.1)' },
  { id: 'database',  label: 'DB Schema',       Icon: DbIcon,   color: '#f97316', bg: 'rgba(249,115,22,0.1)' },
  { id: 'apis',      label: 'API Specs',        Icon: Globe,    color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
  { id: 'docs',      label: 'Documentation',    Icon: FileText, color: '#3b82f6', bg: 'rgba(59,130,246,0.1)' },
  { id: 'terraform', label: 'Terraform',         Icon: Code,     color: '#ec4899', bg: 'rgba(236,72,153,0.1)' },
];

const AI_CHIPS = [
  'Add a Redis cache layer between API and database',
  'Add new microservice called NotificationService',
  'Rename table users to accounts',
  'Add GET /api/v1/analytics endpoint',
  'Add AWS S3 bucket for file uploads',
];

// ── Sidebar Tool Definitions ──────────────────────────────────────────
const TOOLS = [
  { id: 'layers',        Icon: Layers,       label: 'Elements Panel',  shortcut: 'L',  group: 'view'  },
  null,
  { id: 'select',        Icon: MousePointer, label: 'Select Tool',     shortcut: 'V',  group: 'tool'  },
  { id: 'pan',           Icon: Hand,         label: 'Pan Canvas',      shortcut: 'H',  group: 'tool'  },
  null,
  { id: 'add-component', Icon: Network,      label: 'Add Component',   shortcut: 'C',  group: 'draw', color: '#c084fc' },
  { id: 'add-table',     Icon: DbIcon,       label: 'Add DB Table',    shortcut: 'D',  group: 'draw', color: '#fb923c' },
  { id: 'add-api',       Icon: Globe,        label: 'Add API Route',   shortcut: 'A',  group: 'draw', color: '#34d399' },
  { id: 'add-text',      Icon: Type,         label: 'Add Text Label',  shortcut: 'T',  group: 'draw', color: '#60a5fa' },
  null,
  { id: 'delete',        Icon: Trash2,       label: 'Delete Selected', shortcut: '⌫', group: 'action', color: '#f87171' },
  { id: 'fit',           Icon: Maximize2,    label: 'Fit to View',     shortcut: '0',  group: 'action' },
  null,
  { id: 'ask-ai',        Icon: Sparkles,     label: 'Ask AI ✨',        shortcut: '⌘K', group: 'ai',   color: '#a78bfa' },
];

// ── Elements Panel (standalone component) ────────────────────────────
function ElementsPanel({ generatedData, canvasViewMode, setCanvasViewMode, setElementsOpen }) {
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');

  const getItems = () => {
    if (canvasViewMode === 'system') return (generatedData?.components || []);
    if (canvasViewMode === 'database') return (generatedData?.database_schema || []);
    if (canvasViewMode === 'apis') return (generatedData?.apis || []);
    return [];
  };

  const getLabel = (el) => {
    if (canvasViewMode === 'system') return el.name;
    if (canvasViewMode === 'database') return el.name;
    if (canvasViewMode === 'apis') return `${el.method} ${el.path}`;
    return '';
  };

  const getId = (el) => {
    if (canvasViewMode === 'system') return el.id;
    if (canvasViewMode === 'database') return el.name;
    if (canvasViewMode === 'apis') return el.path;
    return '';
  };

  const IconMap = { system: Network, database: DbIcon, apis: Globe };
  const colorMap = { system: '#c084fc', database: '#fb923c', apis: '#34d399' };
  const EIcon = IconMap[canvasViewMode] || Network;
  const eColor = colorMap[canvasViewMode] || '#c084fc';
  const items = getItems();
  const type = canvasViewMode === 'system' ? 'component' : canvasViewMode === 'database' ? 'table' : 'api';

  const deleteEl = (id) => {
    const d = useStore.getState().generatedData;
    if (!d) return;
    let updated = { ...d };
    if (type === 'component') updated.components = (d.components || []).filter(c => c.id !== id);
    else if (type === 'table') updated.database_schema = (d.database_schema || []).filter(t => t.name !== id);
    else if (type === 'api') updated.apis = (d.apis || []).filter(a => a.path !== id);
    useStore.setState({ generatedData: updated, unsavedChanges: true });
    useStore.getState().addLog({ level: 'warn', message: `Deleted ${type}: ${id}` });
  };

  const addEl = () => {
    const d = useStore.getState().generatedData || {};
    if (type === 'component') {
      const id = `comp-${Date.now()}`;
      useStore.setState({ generatedData: { ...d, components: [...(d.components || []), { id, name: 'New Component', type: 'Microservice', description: 'Edit this' }] }, unsavedChanges: true });
    } else if (type === 'table') {
      const name = `new_table_${(d.database_schema || []).length + 1}`;
      useStore.setState({ generatedData: { ...d, database_schema: [...(d.database_schema || []), { name, columns: [{ name: 'id', type: 'INT', constraint: 'PRIMARY KEY' }, { name: 'created_at', type: 'TIMESTAMP', constraint: 'NOT NULL' }] }] }, unsavedChanges: true });
    } else {
      const path = `/api/v1/resource_${(d.apis || []).length + 1}`;
      useStore.setState({ generatedData: { ...d, apis: [...(d.apis || []), { path, method: 'GET', description: 'New endpoint' }] }, unsavedChanges: true });
    }
  };

  const saveRename = (el, newName) => {
    if (!newName.trim()) { setEditingId(null); return; }
    const d = useStore.getState().generatedData;
    if (!d) return;
    if (type === 'component') {
      useStore.setState({ generatedData: { ...d, components: (d.components || []).map(c => c.id === el.id ? { ...c, name: newName } : c) }, unsavedChanges: true });
    } else if (type === 'table') {
      useStore.setState({ generatedData: { ...d, database_schema: (d.database_schema || []).map(t => t.name === el.name ? { ...t, name: newName } : t) }, unsavedChanges: true });
    }
    setEditingId(null);
  };

  return (
    <div className="elements-panel">
      <div className="ep-header">
        <span className="ep-title">Elements</span>
        <div className="ep-hactions">
          <button className="ep-hadd" onClick={addEl} title="Add element"><Plus size={12} /></button>
          <button className="ep-hclose" onClick={() => setElementsOpen(false)}><X size={12} /></button>
        </div>
      </div>

      {/* View switcher */}
      <div className="ep-vtabs">
        {['system', 'database', 'apis'].map(v => (
          <button key={v} className={`ep-vtab ${canvasViewMode === v ? 'active' : ''}`} onClick={() => setCanvasViewMode(v)}>
            {v === 'system' ? 'System' : v === 'database' ? 'DB' : 'API'}
          </button>
        ))}
      </div>

      <div className="ep-count">{items.length} element{items.length !== 1 ? 's' : ''}</div>

      <div className="ep-list">
        {items.length === 0 ? (
          <div className="ep-empty">
            <EIcon size={20} color={eColor} style={{ opacity: 0.4 }} />
            <span>No elements. Click + to add.</span>
          </div>
        ) : items.map((el, i) => {
          const id = getId(el);
          const isEditing = editingId === id;
          return (
            <div key={i} className="ep-item" onClick={() => {}}>
              <div className="ep-item-icon" style={{ color: eColor, background: eColor + '18' }}>
                <EIcon size={11} />
              </div>
              {isEditing ? (
                <input
                  className="ep-item-input"
                  value={editValue}
                  autoFocus
                  onChange={e => setEditValue(e.target.value)}
                  onBlur={() => saveRename(el, editValue)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') saveRename(el, editValue);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                />
              ) : (
                <span
                  className="ep-item-label"
                  title={`Double-click to rename: ${getLabel(el)}`}
                  onDoubleClick={() => { setEditingId(id); setEditValue(el.name || el.path || ''); }}
                >
                  {getLabel(el)}
                </span>
              )}
              <button className="ep-item-del" onClick={(e) => { e.stopPropagation(); deleteEl(id); }} title="Delete">
                <X size={10} />
              </button>
            </div>
          );
        })}
      </div>

      <div className="ep-footer">
        <button className="ep-add-full" onClick={addEl}>
          <Plus size={12} /> Add {type === 'component' ? 'Component' : type === 'table' ? 'Table' : 'Endpoint'}
        </button>
      </div>
    </div>
  );
}

// ── ZoomControls ─────────────────────────────────────────────────────
function ZoomControls() {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  return (
    <StatusBar
      onZoomIn={() => zoomIn({ duration: 200 })}
      onZoomOut={() => zoomOut({ duration: 200 })}
      onFitView={() => fitView({ duration: 300, padding: 0.15 })}
    />
  );
}

// ── Main Canvas Component ────────────────────────────────────────────
function AgentCanvasInner() {
  const selectNode         = useStore((s) => s.selectNode);
  const selectedNode       = useStore((s) => s.selectedNode);
  const setSelectedNode    = useStore((s) => s.setSelectedNode);
  const setZoomLevel       = useStore((s) => s.setZoomLevel);
  const canvasViewMode     = useStore((s) => s.canvasViewMode);
  const setCanvasViewMode  = useStore((s) => s.setCanvasViewMode);
  const generatedData      = useStore((s) => s.generatedData);
  const pipelineStatus     = useStore((s) => s.pipelineStatus);
  const pipelineProgress   = useStore((s) => s.pipelineProgress);
  const currentAgent       = useStore((s) => s.currentAgent);
  const qualityScore       = useStore((s) => s.qualityScore);
  const currentProject     = useStore((s) => s.currentProject);
  const documentationMarkdown     = useStore((s) => s.documentationMarkdown);
  const setDocumentationMarkdown  = useStore((s) => s.setDocumentationMarkdown);
  const editableTerraformCode     = useStore((s) => s.editableTerraformCode);
  const setEditableTerraformCode  = useStore((s) => s.setEditableTerraformCode);
  const saveDocumentation         = useStore((s) => s.saveDocumentation);
  const saveArchitecture          = useStore((s) => s.saveArchitecture);
  const startPipeline             = useStore((s) => s.startPipeline);
  const disconnectSocket          = useStore((s) => s.disconnectSocket);
  const versions                  = useStore((s) => s.versions);
  const unsavedChanges            = useStore((s) => s.unsavedChanges);
  const activeTool                = useStore((s) => s.activeTool);
  const setActiveTool             = useStore((s) => s.setActiveTool);
  
  const [layoutMode, setLayoutMode] = useState('grid');
  const [diffV1, setDiffV1] = useState(null);
  const [diffV2, setDiffV2] = useState(null);
  const [diffData, setDiffData] = useState(null);
  const [diffActive, setDiffActive] = useState(false);
  const [activeLayers, setActiveLayers] = useState(['presentation', 'application', 'data']);
  const fetchDiff = useStore(s => s.fetchDiff);

  const { fitView } = useReactFlow();
  const reactFlowWrapper = useRef(null);

  // UI State
  const [askAiOpen,       setAskAiOpen]       = useState(false);
  const [askAiInput,      setAskAiInput]       = useState('');
  const [askAiProcessing, setAskAiProcessing]  = useState(false);
  const [askAiResponse,   setAskAiResponse]    = useState('');
  const [savedToast,      setSavedToast]       = useState(false);
  const [docsPreview,     setDocsPreview]      = useState(false);
  const [elementsOpen,    setElementsOpen]     = useState(false);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const connectingNodeId = useRef(null);

  const onConnectStart = useCallback((_, { nodeId }) => {
    connectingNodeId.current = nodeId;
  }, []);

  const onConnectEnd = useCallback(
    (event) => {
      if (!connectingNodeId.current) return;

      const targetIsPane = event.target.classList.contains('react-flow__pane');

      if (targetIsPane) {
        const d = useStore.getState().generatedData;
        if (!d) return;

        if (canvasViewMode === 'system') {
          const newId = `comp-${Date.now()}`;
          const newComponent = {
            id: newId,
            name: 'New Component',
            type: 'Microservice',
            description: 'Click to edit description'
          };
          const fromNodeId = connectingNodeId.current.replace('comp-', '');
          const toNodeId = newId.replace('comp-', '');
          
          const updatedComponents = [...(d.components || []), newComponent];
          const updatedConnections = [...(d.connections || []), { from: fromNodeId, to: toNodeId }];
          
          useStore.setState({
            generatedData: { ...d, components: updatedComponents, connections: updatedConnections },
            unsavedChanges: true
          });
        } 
        else if (canvasViewMode === 'database') {
          const fromTableName = connectingNodeId.current.replace('table-', '');
          const newTableName = `table_${(d.database_schema || []).length + 1}`;
          
          const newTable = {
            name: newTableName,
            columns: [
              { name: 'id', type: 'INT', constraint: 'PRIMARY KEY' },
              { name: `${fromTableName}_id`, type: 'UUID', constraint: `FOREIGN KEY REFERENCES ${fromTableName}` }
            ]
          };

          const updatedSchema = [...(d.database_schema || []), newTable];
          useStore.setState({
            generatedData: { ...d, database_schema: updatedSchema },
            unsavedChanges: true
          });
        }
        else if (canvasViewMode === 'apis') {
          const startNode = nodes.find(n => n.id === connectingNodeId.current);
          let prefix = '/api';
          if (startNode && startNode.data && startNode.data.path) {
            prefix = startNode.data.path;
          }
          // Avoid double slashes or trailing slash issues
          const cleanPrefix = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
          const path = `${cleanPrefix}/endpoint_${(d.apis || []).length + 1}`;
          
          const newApi = {
            path,
            method: 'GET',
            description: 'New endpoint — click to edit',
            x: startNode ? startNode.position.x + 280 : 580,
            y: startNode ? startNode.position.y : 100
          };
          const updatedApis = [...(d.apis || []), newApi];
          useStore.setState({
            generatedData: { ...d, apis: updatedApis },
            unsavedChanges: true
          });
        }
      }

      connectingNodeId.current = null;
    },
    [nodes, canvasViewMode]
  );

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge({ ...params, type: 'animated', data: { status: 'success' } }, eds)),
    [setEdges]
  );

  // ── Build nodes/edges ─────────────────────────────────────────────
  useEffect(() => {
    if (pipelineStatus === 'running') {
      setNodes([{
        id: 'pipeline-running', type: 'default', position: { x: 300, y: 160 }, draggable: false,
        style: { background: '#fff', border: '2px solid #8b5cf6', borderRadius: 16, padding: 28, width: 400, boxShadow: '0 20px 60px rgba(139,92,246,0.18)', textAlign: 'center' },
        data: {
          label: (
            <div style={{ fontFamily: 'Inter,sans-serif' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg,#8b5cf6,#c084fc)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Loader2 size={28} color="white" style={{ animation: 'spin 1.2s linear infinite' }} />
                </div>
              </div>
              <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: '#1e293b' }}>AI Agents Generating Architecture</h3>
              <p style={{ fontSize: 12.5, color: '#64748b', margin: '0 0 16px' }}>Active: <strong style={{ color: '#8b5cf6' }}>{currentAgent || 'Initializing...'}</strong></p>
              <div style={{ background: '#f1f5f9', height: 8, borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ background: 'linear-gradient(90deg,#8b5cf6,#c084fc)', height: '100%', width: `${pipelineProgress}%`, transition: 'width 0.5s ease', borderRadius: 4 }} />
              </div>
              <span style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginTop: 8 }}>{pipelineProgress}% complete</span>
            </div>
          ),
        },
      }]);
      setEdges([]);
      return;
    }
    if (!generatedData) { setNodes([]); setEdges([]); return; }

    if (canvasViewMode === 'system') {
      const comps = generatedData.components || [];
      const COLS = 3;
      const COL_W = 380, ROW_H = 260;
      
      const addedIds = (diffData?.added_components || []).map(c => c.id || c.name);
      const removedIds = (diffData?.removed_components || []).map(c => c.id || c.name);
      
      // Basic layer mapping heuristics based on name/type
      const getLayer = (c) => {
        const typeStr = (c.type || '').toLowerCase();
        const nameStr = (c.name || '').toLowerCase();
        if (typeStr.includes('db') || typeStr.includes('database') || nameStr.includes('db')) return 'data';
        if (typeStr.includes('ui') || typeStr.includes('frontend') || typeStr.includes('client')) return 'presentation';
        return 'application';
      };

      const filteredComps = comps.filter(c => activeLayers.includes(getLayer(c)));
      
      let ns = filteredComps.map((c, i) => {
        let diffStatus = 'unchanged';
        if (diffActive) {
          if (addedIds.includes(c.id || c.name)) diffStatus = 'added';
          else if (removedIds.includes(c.id || c.name)) diffStatus = 'removed';
        }
        return {
          id: c.id || `comp-${i}`,
          type: 'systemComponentNode',
          position: { x: 0, y: 0 },
          data: { name: c.name, type: c.type, description: c.description, diffStatus },
        };
      });
      const es = [];
      for (let i = 0; i < ns.length - 1; i++) {
        es.push({ id: `e-s-${i}`, source: ns[i].id, target: ns[i + 1].id, type: 'animated', data: { status: 'success', label: 'REST' } });
      }
      
      if (layoutMode === 'hierarchical') ns = applyHierarchicalLayout(ns, es);
      else if (layoutMode === 'radial') ns = applyRadialLayout(ns);
      else ns = applyGridLayout(ns, COLS);
      
      setNodes(ns); setEdges(es); return;
    }

    if (canvasViewMode === 'cloud') {
      const comps = generatedData.components || [];
      const mappings = generatedData.cloud_mappings || [];
      const COLS = 3, COL_W = 380, ROW_H = 260;
      let ns = comps.map((c, i) => {
        const mapping = mappings.find(m => 
          m.logical_component?.toLowerCase() === c.name?.toLowerCase() ||
          m.component_id === c.id
        );
        return {
          id: c.id || `comp-${i}`,
          type: 'systemComponentNode',
          position: { x: 0, y: 0 },
          data: {
            name: mapping?.aws_service || c.name,
            type: 'AWS Service',
            description: mapping ? `${c.name} → ${mapping.aws_service}` : c.description,
            cloudBadge: mapping?.aws_service,
            isCloudView: true,
          },
        };
      });
      const es = ns.slice(0,-1).map((n, i) => ({ id: `e-cloud-${i}`, source: n.id, target: ns[i+1].id, type: 'animated', data: { status: 'success', label: 'AWS' } }));
      
      if (layoutMode === 'hierarchical') ns = applyHierarchicalLayout(ns, es);
      else if (layoutMode === 'radial') ns = applyRadialLayout(ns);
      else ns = applyGridLayout(ns, COLS);
      
      setNodes(ns); setEdges(es); return;
    }

    if (canvasViewMode === 'security') {
      const comps = generatedData.components || [];
      const findings = useStore.getState().securityFindings || [];
      const COLS = 3, COL_W = 380, ROW_H = 260;
      let ns = comps.map((c, i) => {
        const compFindings = findings.filter(f => 
          f.resource?.toLowerCase().includes(c.name?.toLowerCase().replace(/\s+/g, '_'))
        );
        const hasCritical = compFindings.some(f => f.severity === 'HIGH' || f.severity === 'CRITICAL');
        const hasWarn = compFindings.some(f => f.severity === 'MEDIUM');
        const status = hasCritical ? 'critical' : hasWarn ? 'warning' : findings.length > 0 ? 'clean' : 'unknown';
        return {
          id: c.id || `comp-${i}`,
          type: 'systemComponentNode',
          position: { x: 0, y: 0 },
          data: {
            name: c.name,
            type: c.type,
            description: compFindings.length > 0 ? `${compFindings.length} security issues` : 'No issues found',
            securityStatus: status,
            isSecurityView: true,
          },
        };
      });
      
      if (layoutMode === 'radial') ns = applyRadialLayout(ns);
      else ns = applyGridLayout(ns, COLS);
      
      setNodes(ns); setEdges([]); return;
    }

    if (canvasViewMode === 'database') {
      const tables = generatedData.database_schema || [];
      const ns = tables.map((t, i) => ({
        id: `table-${t.name}`,
        type: 'dbTableNode',
        position: { x: 50 + (i % 3) * 400, y: 50 + Math.floor(i / 3) * 400 },
        data: { name: t.name, columns: t.columns || [] },
      }));
      const es = [];
      tables.forEach((t) => {
        (t.columns || []).forEach((c) => {
          const isFK = c.constraint?.toLowerCase().includes('foreign') || c.name.endsWith('_id') || c.name.endsWith('Id');
          if (!isFK) return;
          const tgt = c.constraint?.match(/references\s+(\w+)/i)?.[1] || (c.name.replace(/_id$/i, '').replace(/Id$/i, '') + 's');
          if (tgt && tables.some((x) => x.name === tgt) && tgt !== t.name) {
            es.push({
              id: `e-db-${tgt}-${t.name}`,
              source: `table-${tgt}`,
              target: `table-${t.name}`,
              sourceHandle: 'col-id',
              targetHandle: `col-${c.name}`,
              type: 'animated',
              data: { status: 'success', label: 'SQL' }
            });
          }
        });
      });
      setNodes(ns); setEdges(es); return;
    }

    if (canvasViewMode === 'apis') {
      const apis = generatedData.apis || [];
      // Group first
      const groups = {};
      apis.forEach((a) => {
        const parts = a.path.split('/');
        const key = parts.length > 2 ? `/${parts[1]}` : '/api';
        if (!groups[key]) groups[key] = [];
        groups[key].push(a);
      });

      const ENDPOINT_H = 60;  // spacing per endpoint
      const GROUP_GAP  = 40;  // gap between groups
      const ROOT_X     = 40;
      const GROUP_X    = 300;
      const ENDPOINT_X = 580;

      const rootNode = { id: 'api-root', type: 'apiEndpointNode', position: { x: ROOT_X, y: 0 }, data: { path: 'API Gateway', isGroupRoot: true } };
      const ns = [rootNode];
      const es = [];
      let cumY = 60;
      const keys = Object.keys(groups);

      keys.forEach((gk, gi) => {
        const gApis = groups[gk];
        const groupH = gApis.length * ENDPOINT_H;
        const groupCenterY = cumY + groupH / 2 - 22;
        const gId = `grp-${gi}`;

        ns.push({ id: gId, type: 'apiEndpointNode', position: { x: GROUP_X, y: groupCenterY }, data: { path: gk, isGroupRoot: true } });
        es.push({ id: `e-root-${gId}`, source: 'api-root', target: gId, type: 'animated', data: { status: 'success' } });

        gApis.forEach((a, ai) => {
          const eId = `ep-${gi}-${ai}`;
          
          let posX = ENDPOINT_X;
          let posY = cumY + ai * ENDPOINT_H;
          if (a.x !== undefined && a.y !== undefined) {
            posX = a.x;
            posY = a.y;
          }

          ns.push({
            id: eId,
            type: 'apiEndpointNode',
            position: { x: posX, y: posY },
            data: { path: a.path, method: a.method, description: a.description }
          });
          
          // Connect to the group node directly
          es.push({ id: `e-${gId}-${eId}`, source: gId, target: eId, type: 'animated', data: { status: 'success' } });
        });
        cumY += groupH + GROUP_GAP;
      });

      rootNode.position.y = cumY / 2 - 25;

      setNodes(ns); setEdges(es); return;
    }
  }, [canvasViewMode, generatedData, pipelineStatus, pipelineProgress, currentAgent, setNodes, setEdges]);

  const onNodeClick = useCallback((_, node) => {
    setSelectedNode(node);
  }, [setSelectedNode]);

  const handleDiffCompare = async () => {
    if (!diffV1 || !diffV2 || !currentProject) return;
    const diff = await fetchDiff(currentProject.id, diffV1, diffV2);
    if (diff) {
      setDiffData(diff);
      setDiffActive(true);
    }
  };

  const onMoveEnd = useCallback((_, vp) => setZoomLevel(vp.zoom), [setZoomLevel]);

  const hasData = generatedData !== null || qualityScore !== null;
  const isRunning = pipelineStatus === 'running';

  const downloadFile = (content, name) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type: 'text/plain' }));
    a.download = name; a.click();
  };

  const handleSave = async () => {
    await saveArchitecture();
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2200);
  };

  const handleSaveDocs = async () => {
    await saveDocumentation(documentationMarkdown);
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2200);
  };

  const exportPDF = () => {
    if (!documentationMarkdown) {
      alert('No documentation to export! Please run the pipeline first.');
      return;
    }

    const renderMarkdownToHtml = (md) => {
      if (!md) return '<p style="color:#94a3b8">No documentation yet.</p>';
      const lines = md.split('\n');
      const html = [];
      let inTable = false;
      let tableRows = [];

      const flushTable = () => {
        if (!tableRows.length) return;
        const [headerRow, , ...dataRows] = tableRows;
        const ths = (headerRow || '').split('|').filter((_, i, a) => i > 0 && i < a.length - 1);
        const trs = dataRows.map(r => r.split('|').filter((_, i, a) => i > 0 && i < a.length - 1));
        html.push(`<table class="doc-table"><thead><tr>${ths.map(h => `<th>${h.trim()}</th>`).join('')}</tr></thead><tbody>${trs.map(r => `<tr>${r.map(c => `<td>${inline(c.trim())}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
        tableRows = [];
        inTable = false;
      };

      const inline = (t) => {
        const text = t.trim();
        if (text === 'GET') return '<span class="doc-badge doc-badge-get">GET</span>';
        if (text === 'POST') return '<span class="doc-badge doc-badge-post">POST</span>';
        if (text === 'PUT') return '<span class="doc-badge doc-badge-put">PUT</span>';
        if (text === 'DELETE') return '<span class="doc-badge doc-badge-delete">DELETE</span>';
        if (text.startsWith('/api') || (text.startsWith('/') && text.length > 1 && !text.includes(' '))) {
          return `<code class="doc-route">${text}</code>`;
        }

        return t
          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.+?)\*/g, '<em>$1</em>')
          .replace(/`([^`]+)`/g, '<code class="doc-code">$1</code>');
      };

      for (const line of lines) {
        if (line.startsWith('|')) {
          if (!inTable) inTable = true;
          tableRows.push(line);
          continue;
        }
        if (inTable) flushTable();

        if (line.startsWith('### ')) { html.push(`<h3 class="doc-h3">${inline(line.slice(4))}</h3>`); continue; }
        if (line.startsWith('## ')) { html.push(`<h2 class="doc-h2">${inline(line.slice(3))}</h2>`); continue; }
        if (line.startsWith('# ')) { html.push(`<h1 class="doc-h1">${inline(line.slice(2))}</h1>`); continue; }
        if (line.startsWith('> ')) { html.push(`<blockquote class="doc-blockquote">${inline(line.slice(2))}</blockquote>`); continue; }
        if (line.match(/^[-*]\s+/)) { html.push(`<div class="doc-li"><span class="doc-li-dot">•</span>${inline(line.replace(/^[-*]\s+/, ''))}</div>`); continue; }
        if (line.trim() === '') { html.push('<div class="doc-spacer"></div>'); continue; }
        html.push(`<p class="doc-p">${inline(line)}</p>`);
      }
      if (inTable) flushTable();
      return html.join('');
    };

    const htmlContent = renderMarkdownToHtml(documentationMarkdown);
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head>
          <title>${currentProject?.name || 'Architecture'} - Documentation</title>
          <style>
            body { font-family: 'Inter', -apple-system, sans-serif; padding: 40px; color: #1e293b; line-height: 1.6; max-width: 800px; margin: 0 auto; }
            h1, .doc-h1 { font-size: 28px; border-bottom: 2.5px solid #8b5cf6; padding-bottom: 12px; color: #0f172a; margin-top: 35px; margin-bottom: 20px; font-weight: 800; }
            h2, .doc-h2 { font-size: 19px; border-bottom: 1.5px solid #e2e8f0; padding-bottom: 8px; color: #1e293b; margin-top: 30px; margin-bottom: 15px; font-weight: 700; }
            h3, .doc-h3 { font-size: 14.5px; color: #334155; margin-top: 22px; margin-bottom: 10px; font-weight: 700; background: #f8fafc; padding: 4px 10px; border-radius: 6px; border-left: 3px solid #8b5cf6; display: inline-block; }
            p, .doc-p { font-size: 13.5px; color: #334155; margin-bottom: 14px; }
            blockquote, .doc-blockquote { border-left: 3px solid #3b82f6; padding: 10px 16px; margin: 15px 0; background: #f0f9ff; color: #1e40af; font-style: italic; border-radius: 0 8px 8px 0; }
            .doc-li { display: flex; gap: 8px; font-size: 13.5px; color: #334155; margin-bottom: 6px; align-items: flex-start; }
            .doc-li-dot { color: #8b5cf6; font-size: 16px; font-weight: bold; }
            .doc-spacer { height: 12px; }
            table, .doc-table { width: 100%; border-collapse: collapse; margin-top: 15px; margin-bottom: 20px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; font-size: 12.5px; }
            th, td { padding: 12px 16px; text-align: left; vertical-align: middle; }
            th { background: #f8fafc; font-weight: 700; color: #475569; border-bottom: 2px solid #e2e8f0; text-transform: uppercase; letter-spacing: 0.3px; font-size: 11px; }
            td { border-bottom: 1px solid #f1f5f9; color: #334155; }
            code, .doc-code { font-family: monospace; font-size: 12px; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; color: #7c3aed; border: 1px solid #e2e8f0; }
            .doc-badge { display: inline-block; padding: 3px 8px; font-size: 11px; font-weight: 700; border-radius: 6px; text-transform: uppercase; letter-spacing: 0.3px; text-align: center; min-width: 60px; }
            .doc-badge-get { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
            .doc-badge-post { background: #dbeafe; color: #1e40af; border: 1px solid #bfdbfe; }
            .doc-badge-put { background: #fef9c3; color: #854d0e; border: 1px solid #fef08a; }
            .doc-badge-delete { background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; }
            .doc-route { font-family: monospace; font-size: 12.5px; background: #f8fafc; color: #475569; padding: 2px 8px; border-radius: 6px; border: 1px solid #e2e8f0; font-weight: 600; }
          </style>
        </head>
        <body>
          ${htmlContent}
          <script>window.onload = function() { window.print(); setTimeout(() => window.close(), 500); }</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const deleteFromStore = (type, id) => {
    const d = useStore.getState().generatedData;
    if (!d) return;
    const updated = { ...d };
    if (type === 'component') updated.components = (d.components || []).filter(c => c.id !== id);
    else if (type === 'table') updated.database_schema = (d.database_schema || []).filter(t => t.name !== id);
    useStore.setState({ generatedData: updated, unsavedChanges: true });
  };

  // Pane click — adds node when draw tool active
  const handlePaneClick = useCallback(() => {
    if (!hasData || !['add-component', 'add-table', 'add-api'].includes(activeTool)) return;
    const d = generatedData || {};
    if (activeTool === 'add-component') {
      const id = `comp-${Date.now()}`;
      useStore.setState({ generatedData: { ...d, components: [...(d.components || []), { id, name: 'New Component', type: 'Microservice', description: 'Edit this' }] }, unsavedChanges: true });
      setCanvasViewMode('system');
    } else if (activeTool === 'add-table') {
      const name = `table_${(d.database_schema || []).length + 1}`;
      useStore.setState({ generatedData: { ...d, database_schema: [...(d.database_schema || []), { name, columns: [{ name: 'id', type: 'INT', constraint: 'PRIMARY KEY' }, { name: 'created_at', type: 'TIMESTAMP', constraint: 'NOT NULL' }] }] }, unsavedChanges: true });
      setCanvasViewMode('database');
    } else if (activeTool === 'add-api') {
      const path = `/api/v1/resource_${(d.apis || []).length + 1}`;
      useStore.setState({ generatedData: { ...d, apis: [...(d.apis || []), { path, method: 'GET', description: 'New endpoint' }] }, unsavedChanges: true });
      setCanvasViewMode('apis');
    }
    setActiveTool('select');
  }, [activeTool, generatedData, hasData, setCanvasViewMode, setActiveTool]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'v' || e.key === 'V') setActiveTool('select');
    if (e.key === 'h' || e.key === 'H') setActiveTool('pan');
    if (e.key === 'l' || e.key === 'L') setElementsOpen(o => !o);
    if (e.key === '0') fitView({ duration: 300, padding: 0.15 });
    if (e.key === 'Escape') { setAskAiOpen(false); }
    if ((e.key === 'Delete' || e.key === 'Backspace') && hasData) {
      const selected = nodes.filter(n => n.selected);
      selected.forEach(n => {
        if (n.type === 'systemComponentNode') deleteFromStore('component', n.id);
        else if (n.type === 'dbTableNode') deleteFromStore('table', n.id.replace('table-', ''));
      });
      if (selected.length > 0) {
        setNodes(ns => ns.filter(n => !n.selected));
        setEdges(es => es.filter(e => !e.selected));
      }
    }
  }, [nodes, hasData, setActiveTool, fitView, setNodes, setEdges]);

  // Tool click handler
  const handleToolClick = (id) => {
    if (id === 'ask-ai') { setAskAiOpen(true); setAskAiResponse(''); setAskAiInput(''); return; }
    if (id === 'layers') { setElementsOpen(o => !o); return; }
    if (id === 'fit') { fitView({ duration: 300, padding: 0.15 }); return; }
    if (id === 'delete') {
      const selected = nodes.filter(n => n.selected);
      selected.forEach(n => {
        if (n.type === 'systemComponentNode') deleteFromStore('component', n.id);
        else if (n.type === 'dbTableNode') deleteFromStore('table', n.id.replace('table-', ''));
      });
      if (selected.length > 0) setNodes(ns => ns.filter(n => !n.selected));
      return;
    }
    setActiveTool(id);
  };

  // Ask AI
  const handleAskAi = async () => {
    if (!askAiInput.trim() || askAiProcessing) return;
    setAskAiProcessing(true);
    setAskAiResponse('');
    const input = askAiInput;

    const renameMatch   = input.match(/rename\s+(?:table\s+)?(\w+)\s+to\s+(\w+)/i);
    const addTableMatch = input.match(/add\s+(?:a?\s*)?(?:new\s+)?table\s+(?:called\s+|named\s+)?["']?(\w+)["']?/i);
    const addCompMatch  = input.match(/add\s+(?:a?\s*)?(?:new\s+)?(?:service|component|microservice)\s+(?:called\s+|named\s+)?["']?(.+?)["']?$/i);
    const addApiMatch   = input.match(/add\s+(?:a?\s*)?.*?(GET|POST|PUT|DELETE|PATCH)?\s*(?:endpoint|route|api)\s+(\/\S+)/i);
    const addS3Match    = input.match(/add\s+(?:an?\s+)?(?:aws\s+)?s3(?:\s+bucket)?(?:\s+for\s+(.+))?/i);

    if (renameMatch) {
      const [, from, to] = renameMatch;
      const d = generatedData || {};
      useStore.setState({ generatedData: { ...d, database_schema: (d.database_schema || []).map(t => t.name === from ? { ...t, name: to } : t) }, unsavedChanges: true });
      setCanvasViewMode('database');
      setAskAiResponse(`✅ Renamed table "${from}" → "${to}"`);
      setAskAiProcessing(false); return;
    }
    if (addTableMatch) {
      const name = addTableMatch[1];
      const d = generatedData || {};
      useStore.setState({ generatedData: { ...d, database_schema: [...(d.database_schema || []), { name, columns: [{ name: 'id', type: 'INT', constraint: 'PRIMARY KEY' }, { name: 'created_at', type: 'TIMESTAMP', constraint: 'NOT NULL' }] }] }, unsavedChanges: true });
      setCanvasViewMode('database');
      setAskAiResponse(`✅ Added table "${name}" with id + created_at columns.`);
      setAskAiProcessing(false); return;
    }
    if (addCompMatch) {
      const name = addCompMatch[1].trim();
      const d = generatedData || {};
      useStore.setState({ generatedData: { ...d, components: [...(d.components || []), { id: `comp-${Date.now()}`, name, type: 'Microservice', description: `${name} service` }] }, unsavedChanges: true });
      setCanvasViewMode('system');
      setAskAiResponse(`✅ Added component "${name}" to system architecture.`);
      setAskAiProcessing(false); return;
    }
    if (addApiMatch) {
      const method = (addApiMatch[1] || 'GET').toUpperCase();
      const path   = addApiMatch[2];
      const d      = generatedData || {};
      useStore.setState({ generatedData: { ...d, apis: [...(d.apis || []), { path, method, description: `${method} ${path}` }] }, unsavedChanges: true });
      setCanvasViewMode('apis');
      setAskAiResponse(`✅ Added ${method} ${path} to API spec.`);
      setAskAiProcessing(false); return;
    }

    if (addS3Match) {
      const d = generatedData || {};
      const components = d.components || [];
      const exists = components.some(c => `${c.name || ''} ${c.type || ''}`.toLowerCase().includes('s3'));
      if (exists) { setCanvasViewMode('system'); setAskAiResponse('AWS S3 bucket already exists in the system architecture.'); setAskAiProcessing(false); return; }
      const purpose = (addS3Match[1] || 'file uploads').trim();
      const newId = `s3-${Date.now()}`;
      const s3Component = { id: newId, name: 'AWS S3 Bucket', type: 'Object Storage', description: `Store ${purpose}` };
      const source = components.find(c => { const v = `${c.name || ''} ${c.type || ''}`.toLowerCase(); return v.includes('api') || v.includes('backend') || v.includes('web server') || v.includes('server'); });
      const connections = [...(d.connections || [])];
      if (source) connections.push({ from: source.id || source.name, to: newId });
      useStore.setState({ generatedData: { ...d, components: [...components, s3Component], connections }, unsavedChanges: true });
      setCanvasViewMode('system');
      setAskAiResponse('Added AWS S3 Bucket for file uploads to the system architecture.');
      setAskAiProcessing(false); return;
    }

    // Fallback to backend
    try {
      const token = localStorage.getItem('token');
      const pid = currentProject?.id;
      if (!pid) { setAskAiResponse('Select a project first.'); setAskAiProcessing(false); return; }
      const res = await fetch(`http://localhost:3000/api/chat/${pid}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '' },
        body: JSON.stringify({ content: `[Canvas AI] ${input}` }),
      });
      if (res.ok) {
        if (!res.body) { setAskAiResponse('AI returned an empty response.'); }
        else {
          const reader = res.body.getReader();
          const decoder = new TextDecoder('utf-8', { fatal: false });
          let text = ''; let buffer = '';
          const appendData = (raw) => {
            if (!raw || raw === '[DONE]') return;
            let data = raw;
            try { const parsed = JSON.parse(raw); if (typeof parsed === 'string') data = parsed; else if (parsed && typeof parsed === 'object') data = parsed.content ?? parsed.text ?? parsed.delta ?? parsed.message ?? parsed.data ?? raw; } catch {}
            if (typeof data !== 'string') data = String(data);
            data = data.replace(/\\n/g, '\n'); text += data; setAskAiResponse(text);
          };
          const processEvent = (block) => { const lines = block.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).replace(/^\s/, '')); if (lines.length) appendData(lines.join('\n')); };
          while (true) {
            const { value, done } = await reader.read();
            if (done) { buffer += decoder.decode(); break; }
            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split(/\r?\n\r?\n/); buffer = events.pop() || '';
            for (const event of events) processEvent(event);
          }
          if (buffer.trim()) processEvent(buffer);
          setAskAiResponse(text || 'Command received. Check the canvas views for updates.');
        }
      } else {
        let message = `AI request failed (${res.status}).`;
        try { const body = await res.json(); message = body.detail || body.message || message; } catch {}
        setAskAiResponse(message);
      }
    } catch {
      setAskAiResponse('AI unavailable. Try commands like "rename table users to accounts" or "add component AuthService".');
    }
    setAskAiProcessing(false);
  };

  // ── Sidebar ──────────────────────────────────────────────────────
  const Sidebar = () => (
    <aside className="canvas-sidebar">
      <div className="cbar-brand">
        <Sparkles size={16} color="#a78bfa" />
      </div>

      <div className="cbar-tools">
        {TOOLS.map((tool, i) => {
          if (!tool) return <div key={`sep-${i}`} className="cbar-sep" />;
          const { id, Icon, label, shortcut, color } = tool;
          const isActive = activeTool === id || (id === 'layers' && elementsOpen) || (id === 'ask-ai' && askAiOpen);
          return (
            <div key={id} className="cbar-item" data-tooltip={`${label} (${shortcut})`}>
              <button
                className={`cbar-btn ${isActive ? 'cbar-active' : ''} ${id === 'delete' ? 'cbar-danger' : ''}`}
                onClick={() => handleToolClick(id)}
                style={isActive && color ? { background: `${color}22`, color } : {}}
                title={`${label} (${shortcut})`}
              >
                <Icon size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </aside>
  );

  // ── Tab Bar ──────────────────────────────────────────────────────
  const TabBar = () => (
    <>
    <div className="ctab-bar">
      <div className="ctab-group">
        {VIEW_TABS.map(({ id, label, Icon, color, bg }) => {
          const active = canvasViewMode === id;
          return (
            <button
              key={id}
              className={`ctab ${active ? 'ctab-active' : ''}`}
              onClick={() => setCanvasViewMode(id)}
              disabled={!hasData && !isRunning && id !== 'system'}
              style={active ? { color, background: bg, borderColor: `${color}40` } : {}}
            >
              <Icon size={13} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      <div className="ctab-right">
        {canvasViewMode === 'database' && hasData && (
          <button className="ctab-action" onClick={() => {
            navigator.clipboard.writeText(SQL_SCHEMA(generatedData.database_schema || []));
            useStore.getState().addLog({ level: 'success', message: 'SQL DDL copied!' });
          }}>
            <DbIcon size={11} /> Copy SQL
          </button>
        )}
        {hasData && versions.length > 0 && (
          <div className="ctab-version">
            <Clock size={11} />
            <select onChange={(e) => useStore.getState().addLog({ level: 'info', message: `v${e.target.value}` })}>
              {versions.map(v => <option key={v.id} value={v.versionNumber}>v{v.versionNumber}</option>)}
            </select>
          </div>
        )}
        <div className="ctab-layout">
          <Layers size={11} />
          <select
            value={layoutMode}
            onChange={(e) => {
              const mode = e.target.value;
              setLayoutMode(mode);
              let laidOut;
              if (mode === 'hierarchical') laidOut = applyHierarchicalLayout(nodes, edges);
              else if (mode === 'radial') laidOut = applyRadialLayout(nodes);
              else laidOut = applyGridLayout(nodes);
              setNodes(laidOut);
            }}
            className="ctab-layout-select"
          >
            <option value="grid">Grid Layout</option>
            <option value="hierarchical">Hierarchical</option>
            <option value="radial">Radial</option>
          </select>
        </div>
        {hasData && versions.length >= 2 && (
          <div className="ctab-compare">
            <span style={{ fontSize: 10, color: '#94a3b8' }}>Compare:</span>
            <select className="ctab-layout-select" onChange={e => setDiffV1(parseInt(e.target.value))}>
              {versions.map(v => <option key={v.id} value={v.versionNumber}>v{v.versionNumber}</option>)}
            </select>
            <span style={{ fontSize: 10, color: '#94a3b8' }}>vs</span>
            <select className="ctab-layout-select" onChange={e => setDiffV2(parseInt(e.target.value))} defaultValue={versions[1]?.versionNumber}>
              {versions.map(v => <option key={v.id} value={v.versionNumber}>v{v.versionNumber}</option>)}
            </select>
            <button className="ctab-action" onClick={handleDiffCompare}>Diff</button>
            {diffActive && <button className="ctab-action" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }} onClick={() => { setDiffActive(false); setDiffData(null); }}>Clear</button>}
          </div>
        )}
        {canvasViewMode === 'apis' && hasData && (
          <button className="ctab-action" onClick={() => {
            const d = useStore.getState().generatedData || {};
            const path = `/api/v1/endpoint_${(d.apis || []).length + 1}`;
            useStore.setState({ generatedData: { ...d, apis: [...(d.apis || []), { path, method: 'GET', description: 'New endpoint — click to edit' }] }, unsavedChanges: true });
          }}>
            <Plus size={11} /> Add Endpoint
          </button>
        )}
        {canvasViewMode === 'apis' && hasData && (
          <button className="ctab-action ask-ai-action" onClick={() => { setAskAiOpen(true); setAskAiResponse(''); setAskAiInput(''); }}>
            <Sparkles size={11} /> Ask AI
          </button>
        )}
        {unsavedChanges && !savedToast && (
          <div className="ctab-unsaved">
            <span className="ctab-unsaved-dot" />
            <span>Unsaved</span>
            <button className="ctab-unsaved-save" onClick={handleSave}><Save size={10} /> Save</button>
          </div>
        )}
        {savedToast && <div className="ctab-saved"><Check size={11} /> Saved!</div>}
      </div>
    </div>
    </>
  );

  // ── Docs Editor ──────────────────────────────────────────────────
  if (canvasViewMode === 'docs') {
    const headers = (documentationMarkdown || '')
      .split('\n')
      .filter(line => line.startsWith('#'))
      .map(line => {
        const level = line.match(/^#+/)[0].length;
        const text = line.replace(/^#+\s+/, '');
        return { level, text };
      });

    // ── Markdown → HTML renderer ──────────────────────────────────
    const renderMarkdownToHtml = (md) => {
      if (!md) return '<p style="color:#94a3b8">No documentation yet. Start editing above.</p>';
      const lines = md.split('\n');
      const html = [];
      let inTable = false;
      let tableRows = [];

      const flushTable = () => {
        if (!tableRows.length) return;
        const [headerRow, , ...dataRows] = tableRows;
        const ths = (headerRow || '').split('|').filter((_, i, a) => i > 0 && i < a.length - 1);
        const trs = dataRows.map(r => r.split('|').filter((_, i, a) => i > 0 && i < a.length - 1));
        html.push(`<table class="doc-table"><thead><tr>${ths.map(h => `<th>${h.trim()}</th>`).join('')}</tr></thead><tbody>${trs.map(r => `<tr>${r.map(c => `<td>${inline(c.trim())}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
        tableRows = [];
        inTable = false;
      };

      const inline = (t) => {
        const text = t.trim();
        if (text === 'GET') return '<span class="doc-badge doc-badge-get">GET</span>';
        if (text === 'POST') return '<span class="doc-badge doc-badge-post">POST</span>';
        if (text === 'PUT') return '<span class="doc-badge doc-badge-put">PUT</span>';
        if (text === 'DELETE') return '<span class="doc-badge doc-badge-delete">DELETE</span>';
        if (text.startsWith('/api') || (text.startsWith('/') && text.length > 1 && !text.includes(' '))) {
          return `<code class="doc-route">${text}</code>`;
        }

        return t
          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.+?)\*/g, '<em>$1</em>')
          .replace(/`([^`]+)`/g, '<code class="doc-code">$1</code>');
      };

      for (const line of lines) {
        if (line.startsWith('|')) {
          if (!inTable) inTable = true;
          tableRows.push(line);
          continue;
        }
        if (inTable) flushTable();

        if (line.startsWith('### ')) { html.push(`<h3 class="doc-h3">${inline(line.slice(4))}</h3>`); continue; }
        if (line.startsWith('## ')) { html.push(`<h2 class="doc-h2">${inline(line.slice(3))}</h2>`); continue; }
        if (line.startsWith('# ')) { html.push(`<h1 class="doc-h1">${inline(line.slice(2))}</h1>`); continue; }
        if (line.startsWith('> ')) { html.push(`<blockquote class="doc-blockquote">${inline(line.slice(2))}</blockquote>`); continue; }
        if (line.match(/^[-*]\s+/)) { html.push(`<div class="doc-li"><span class="doc-li-dot">•</span>${inline(line.replace(/^[-*]\s+/, ''))}</div>`); continue; }
        if (line.trim() === '') { html.push('<div class="doc-spacer"></div>'); continue; }
        html.push(`<p class="doc-p">${inline(line)}</p>`);
      }
      if (inTable) flushTable();
      return html.join('');
    };

    return (
      <div className="canvas-shell" onKeyDown={handleKeyDown} tabIndex={-1}>
        <div className="canvas-main">
          <TabBar />
          <div className="editor-panel">
            <div className="editor-header">
              <div className="editor-hl">
                <FileText size={15} color="#3b82f6" />
                <span className="editor-title">Architecture Documentation</span>
                {unsavedChanges && <span className="unsaved-pill">● Unsaved</span>}
              </div>
              <div className="editor-hr">
                <button className={`emode-btn ${!docsPreview ? 'active' : ''}`} onClick={() => setDocsPreview(false)}><Edit3 size={12} /> Edit</button>
                <button className={`emode-btn ${docsPreview ? 'active' : ''}`} onClick={() => setDocsPreview(true)}><Eye size={12} /> Preview</button>
                <div className="editor-sep" />
                <button className="editor-action-btn" onClick={() => downloadFile(documentationMarkdown, `${currentProject?.name || 'arch'}-docs.md`)}><Download size={12} /> .md</button>
                <button className="editor-action-btn" onClick={exportPDF} title="Save PDF to desktop"><Download size={12} /> .pdf</button>
                <button className="editor-save-btn" onClick={handleSaveDocs}><Save size={12} /> Save</button>
              </div>
            </div>
            
            <div className="editor-body-layout">
              {/* Document Outline sidebar */}
              <div className="editor-sidebar">
                <div className="ed-sidebar-title">Document Outline</div>
                <div className="ed-outline-list">
                  {headers.length === 0 ? (
                    <div className="ed-outline-empty">No headers yet. Add # headings to build outline.</div>
                  ) : (
                    headers.map((h, hi) => (
                      <div key={hi} className={`ed-outline-item level-${h.level}`}>
                        <span className="ed-outline-bullet">{'  '.repeat(h.level - 1)}{'#'.repeat(h.level)}</span>
                        <span className="ed-outline-text">{h.text}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
              
              <div className="editor-content-area">
                {docsPreview ? (
                  <div
                    className="editor-preview doc-rendered"
                    dangerouslySetInnerHTML={{ __html: renderMarkdownToHtml(documentationMarkdown) }}
                  />
                ) : (
                  <textarea
                    className="editor-textarea"
                    value={documentationMarkdown}
                    onChange={e => setDocumentationMarkdown(e.target.value)}
                    placeholder="# Architecture Documentation&#10;&#10;Start writing your architecture document here..."
                    spellCheck={false}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Terraform Editor ─────────────────────────────────────────────
  if (canvasViewMode === 'terraform') {
    const resources = [];
    const resourceRegex = /resource\s+"([^"]+)"\s+"([^"]+)"/g;
    let match;
    while ((match = resourceRegex.exec(editableTerraformCode || '')) !== null) {
      resources.push({ type: match[1], name: match[2] });
    }

    return (
      <div className="canvas-shell" onKeyDown={handleKeyDown} tabIndex={-1}>
        <div className="canvas-main">
          <TabBar />
          <div className="editor-panel">
            <div className="editor-header">
              <div className="editor-hl">
                <Code size={15} color="#ec4899" />
                <span className="editor-title">Terraform Infrastructure Code</span>
                {unsavedChanges && <span className="unsaved-pill">● Unsaved</span>}
              </div>
              <div className="editor-hr">
                <button className="editor-action-btn" onClick={() => downloadFile(editableTerraformCode, `${currentProject?.name || 'infra'}.tf`)}><Download size={12} /> .tf</button>
                <button className="editor-save-btn" onClick={saveArchitecture}><Save size={12} /> Save</button>
              </div>
            </div>
            
            <div className="editor-body-layout">
              {/* Terraform resources sidebar */}
              <div className="editor-sidebar terraform">
                <div className="ed-sidebar-title">Infrastructure Resources</div>
                <div className="ed-outline-list">
                  {resources.length === 0 ? (
                    <div className="ed-outline-empty">No resources defined yet.</div>
                  ) : (
                    resources.map((r, ri) => (
                      <div key={ri} className="ed-resource-item">
                        <span className="ed-resource-badge">{r.type.replace('aws_', '')}</span>
                        <span className="ed-resource-name">{r.name}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
              
              <div className="editor-content-area">
                <textarea className="editor-textarea terraform" value={editableTerraformCode} onChange={e => setEditableTerraformCode(e.target.value)} placeholder={'# Terraform IaC\nprovider "aws" {\n  region = "us-east-1"\n}\n'} spellCheck={false} />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Empty Canvas ─────────────────────────────────────────────────
  const EmptyCanvas = () => (
          <div className="canvas-empty">
      <div className="canvas-empty-icon"><Sparkles size={36} color="white" /></div>
      <h2 className="canvas-empty-title">No Architecture Yet</h2>
      <p className="canvas-empty-sub">Upload your requirements document and run the pipeline to generate a beautiful architecture diagram.</p>
      <div className="canvas-empty-steps">
        {['Upload requirements PDF/document', 'Click Run Pipeline in the top bar', 'Watch AI agents build your architecture'].map((s, i) => (
          <div key={i} className="canvas-step"><span className="canvas-step-num">{i + 1}</span><span>{s}</span></div>
        ))}
      </div>
      <button className="canvas-run-btn" onClick={startPipeline}>
        <Play size={15} fill="currentColor" /> Run Pipeline Now
      </button>
    </div>
  );

  // ── Main Canvas Return ───────────────────────────────────────────
  return (
    <div className="canvas-shell" onKeyDown={handleKeyDown} tabIndex={-1}>
      <Sidebar />

      <div className="canvas-main" ref={reactFlowWrapper}>
        <TabBar />

        {elementsOpen && hasData && (
          <ElementsPanel
            generatedData={generatedData}
            canvasViewMode={canvasViewMode}
            setCanvasViewMode={setCanvasViewMode}
            setElementsOpen={setElementsOpen}
          />
        )}

        <ArchitectureSummaryBar />

        {!hasData && !isRunning ? (
          <EmptyCanvas />
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onConnectStart={onConnectStart}
            onConnectEnd={onConnectEnd}
            onNodeClick={onNodeClick}
            onMoveEnd={onMoveEnd}
            onPaneClick={handlePaneClick}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            nodesDraggable={activeTool !== 'pan'}
            panOnDrag={activeTool === 'pan' || activeTool === 'select'}
            nodesConnectable={true}
            elementsSelectable={true}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.06}
            maxZoom={2.5}
            defaultEdgeOptions={{ type: 'animated' }}
            proOptions={{ hideAttribution: true }}
            className={`rf-cursor-${activeTool}`}
          >
            <Background variant="dots" gap={22} size={1.4} color="#cbd5e1" style={{ backgroundColor: '#f8fafc' }} />
          </ReactFlow>
        )}

        {unsavedChanges && !savedToast && (
          // Unsaved toast now lives in TabBar — this is a redundant safety fallback (hidden)
          null
        )}
        {savedToast && null}

        {askAiOpen && (
          <div className="ask-overlay" onClick={() => setAskAiOpen(false)}>
            <div className="ask-modal" onClick={e => e.stopPropagation()}>
              <div className="ask-header">
                <div className="ask-title">
                  <div className="ask-icon"><Sparkles size={16} /></div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>Ask AI to Modify Diagram</div>
                    <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>Type a command or pick a suggestion</div>
                  </div>
                </div>
                <button className="ask-close" onClick={() => setAskAiOpen(false)}><X size={15} /></button>
              </div>
              <div className="ask-chips">
                {AI_CHIPS.map(s => <button key={s} className="ask-chip" onClick={() => setAskAiInput(s)}>{s}</button>)}
              </div>
              <div className="ask-input-row">
                <input autoFocus className="ask-input" placeholder='e.g. "Add Redis cache between API and database"' value={askAiInput} onChange={e => setAskAiInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAskAi()} />
                <button className="ask-send" onClick={handleAskAi} disabled={askAiProcessing || !askAiInput.trim()}>
                  {askAiProcessing ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Zap size={15} />}
                </button>
              </div>
              {askAiResponse && <div className="ask-response">{askAiResponse}</div>}
            </div>
          </div>
        )}

        <ZoomControls />
        <ContextMenu />
      </div>
    </div>
  );
}

// Wrap with ReactFlowProvider so useReactFlow() works everywhere
export default function AgentCanvas() {
  return (
    <ReactFlowProvider>
      <AgentCanvasInner />
    </ReactFlowProvider>
  );
}
