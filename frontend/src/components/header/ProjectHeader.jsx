import React, { useState, useRef, useEffect } from 'react';
import {
  Plus,
  UploadCloud,
  FileText,
  CheckCircle2,
  MessageSquare,
  Layout,
  Sparkles,
  Search,
  Zap,
  Bell,
  X
} from 'lucide-react';

import useStore from '../../store/useStore';
import ArchitectureWalkthroughModal from './ArchitectureWalkthroughModal';
import './ProjectHeader.css';

export default function ProjectHeader() {
  // ============================================================
  // STORE
  // ============================================================

  const currentProject = useStore((s) => s.currentProject);
  const createProject = useStore((s) => s.createProject);
  const uploadDoc = useStore((s) => s.uploadDoc);
  const uploadedDocuments = useStore((s) => s.uploadedDocuments);
  const documentationMarkdown = useStore((s) => s.documentationMarkdown);
  const generatedData = useStore((s) => s.generatedData);
  const qualityScore = useStore((s) => s.qualityScore);
  const currentTab = useStore((s) => s.currentTab);
  const setCurrentTab = useStore((s) => s.setCurrentTab);

  const hasGeneratedData =
    generatedData !== null || qualityScore !== null;

  // ============================================================
  // LOCAL STATE
  // ============================================================

  const [showCreate, setShowCreate] = useState(false);

  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');

  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [showNotifications, setShowNotifications] =
    useState(false);

  const [showWalkthrough, setShowWalkthrough] =
    useState(false);

  // ============================================================
  // REFS
  // ============================================================

  const fileInputRef = useRef(null);
  const searchRef = useRef(null);
  const notifRef = useRef(null);

  // ============================================================
  // CLOSE PANELS
  // ============================================================

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        setShowSearch(false);
        setShowNotifications(false);
        setShowWalkthrough(false);
        setSearchQuery('');
      }
    };

    const handleClick = (e) => {
      if (
        searchRef.current &&
        !searchRef.current.contains(e.target)
      ) {
        setShowSearch(false);
        setSearchQuery('');
      }

      if (
        notifRef.current &&
        !notifRef.current.contains(e.target)
      ) {
        setShowNotifications(false);
      }
    };

    document.addEventListener('keydown', handleKey);
    document.addEventListener('mousedown', handleClick);

    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('mousedown', handleClick);
    };
  }, []);

  // ============================================================
  // CLOSE WALKTHROUGH IF PROJECT CHANGES
  // ============================================================

  useEffect(() => {
    setShowWalkthrough(false);
  }, [currentProject?.id]);

  // ============================================================
  // CREATE PROJECT
  // ============================================================

  const handleCreate = async (e) => {
    e.preventDefault();

    if (!name.trim()) {
      return;
    }

    await createProject(name, desc);

    setName('');
    setDesc('');
    setShowCreate(false);
  };

  // ============================================================
  // DOCUMENT UPLOAD
  // ============================================================

  const handleFileChange = async (e) => {
    const files = e.target.files;

    if (files && files.length > 0) {
      await uploadDoc(files);
    }

    /*
     * Reset input so selecting the same file again still triggers
     * onChange.
     */
    e.target.value = '';
  };

  // ============================================================
  // EXPLAIN ARCHITECTURE
  // ============================================================

  const handleOpenWalkthrough = () => {
    if (!currentProject) {
      return;
    }

    /*
     * Prevent multiple header dropdowns from remaining open behind
     * the walkthrough modal.
     */
    setShowSearch(false);
    setSearchQuery('');
    setShowNotifications(false);

    setShowWalkthrough(true);
  };

  const handleCloseWalkthrough = () => {
    setShowWalkthrough(false);
  };

  // ============================================================
  // EXPORT PDF
  // ============================================================

  const handleExportPDF = () => {
    if (!documentationMarkdown) {
      alert(
        'No documentation to export! Please run the pipeline first.'
      );

      return;
    }

    const renderMarkdownToHtml = (md) => {
      if (!md) {
        return '<p style="color:#94a3b8">No documentation yet.</p>';
      }

      const lines = md.split('\n');
      const html = [];

      let inTable = false;
      let tableRows = [];

      const inline = (text) =>
        text
          .replace(
            /\*\*(.+?)\*\*/g,
            '<strong>$1</strong>'
          )
          .replace(
            /\*(.+?)\*/g,
            '<em>$1</em>'
          )
          .replace(
            /`([^`]+)`/g,
            '<code class="doc-code">$1</code>'
          );

      const flushTable = () => {
        if (!tableRows.length) {
          return;
        }

        const [headerRow, , ...dataRows] =
          tableRows;

        const ths = (headerRow || '')
          .split('|')
          .filter(
            (_, i, arr) =>
              i > 0 && i < arr.length - 1
          );

        const trs = dataRows.map((row) =>
          row
            .split('|')
            .filter(
              (_, i, arr) =>
                i > 0 && i < arr.length - 1
            )
        );

        html.push(`
          <table class="doc-table">
            <thead>
              <tr>
                ${ths
                  .map(
                    (heading) =>
                      `<th>${inline(
                        heading.trim()
                      )}</th>`
                  )
                  .join('')}
              </tr>
            </thead>

            <tbody>
              ${trs
                .map(
                  (row) => `
                    <tr>
                      ${row
                        .map(
                          (cell) =>
                            `<td>${inline(
                              cell.trim()
                            )}</td>`
                        )
                        .join('')}
                    </tr>
                  `
                )
                .join('')}
            </tbody>
          </table>
        `);

        tableRows = [];
        inTable = false;
      };

      for (const line of lines) {
        // --------------------------------------------------------
        // TABLE
        // --------------------------------------------------------

        if (line.startsWith('|')) {
          if (!inTable) {
            inTable = true;
          }

          tableRows.push(line);

          continue;
        }

        if (inTable) {
          flushTable();
        }

        // --------------------------------------------------------
        // HEADINGS
        // --------------------------------------------------------

        if (line.startsWith('### ')) {
          html.push(
            `<h3 class="doc-h3">${inline(
              line.slice(4)
            )}</h3>`
          );

          continue;
        }

        if (line.startsWith('## ')) {
          html.push(
            `<h2 class="doc-h2">${inline(
              line.slice(3)
            )}</h2>`
          );

          continue;
        }

        if (line.startsWith('# ')) {
          html.push(
            `<h1 class="doc-h1">${inline(
              line.slice(2)
            )}</h1>`
          );

          continue;
        }

        // --------------------------------------------------------
        // BLOCKQUOTE
        // --------------------------------------------------------

        if (line.startsWith('> ')) {
          html.push(
            `<blockquote class="doc-blockquote">${inline(
              line.slice(2)
            )}</blockquote>`
          );

          continue;
        }

        // --------------------------------------------------------
        // LIST
        // --------------------------------------------------------

        if (line.match(/^[-*]\s+/)) {
          html.push(`
            <div class="doc-li">
              <span class="doc-li-dot">•</span>
              ${inline(
                line.replace(/^[-*]\s+/, '')
              )}
            </div>
          `);

          continue;
        }

        // --------------------------------------------------------
        // EMPTY LINE
        // --------------------------------------------------------

        if (line.trim() === '') {
          html.push(
            '<div class="doc-spacer"></div>'
          );

          continue;
        }

        // --------------------------------------------------------
        // PARAGRAPH
        // --------------------------------------------------------

        html.push(
          `<p class="doc-p">${inline(line)}</p>`
        );
      }

      if (inTable) {
        flushTable();
      }

      return html.join('');
    };

    const htmlContent =
      renderMarkdownToHtml(
        documentationMarkdown
      );

    const printWindow =
      window.open('', '_blank');

    if (!printWindow) {
      alert(
        'The PDF window was blocked by your browser. Please allow pop-ups and try again.'
      );

      return;
    }

    printWindow.document.write(`
      <html>

        <head>

          <title>
            ${currentProject?.name || 'Architecture'} - Documentation
          </title>

          <style>

            body {
              font-family: 'Inter', -apple-system, sans-serif;
              padding: 40px;
              color: #1e293b;
              line-height: 1.6;
              max-width: 800px;
              margin: 0 auto;
            }

            h1,
            .doc-h1 {
              font-size: 28px;
              border-bottom: 2px solid #7c3aed;
              padding-bottom: 10px;
              color: #7c3aed;
              margin-top: 30px;
              margin-bottom: 15px;
              font-weight: 700;
            }

            h2,
            .doc-h2 {
              font-size: 20px;
              border-bottom: 1px solid #e2e8f0;
              padding-bottom: 6px;
              color: #0f172a;
              margin-top: 25px;
              margin-bottom: 12px;
              font-weight: 600;
            }

            h3,
            .doc-h3 {
              font-size: 16px;
              color: #334155;
              margin-top: 20px;
              margin-bottom: 10px;
              font-weight: 600;
            }

            p,
            .doc-p {
              font-size: 13.5px;
              color: #475569;
              margin-bottom: 14px;
            }

            blockquote,
            .doc-blockquote {
              border-left: 4px solid #8b5cf6;
              padding: 8px 16px;
              margin: 15px 0;
              background: #f8fafc;
              color: #475569;
              font-style: italic;
            }

            .doc-li {
              display: flex;
              gap: 8px;
              font-size: 13.5px;
              color: #475569;
              margin-bottom: 6px;
              align-items: flex-start;
            }

            .doc-li-dot {
              color: #8b5cf6;
              font-weight: bold;
            }

            .doc-spacer {
              height: 12px;
            }

            table,
            .doc-table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 15px;
              margin-bottom: 20px;
            }

            th,
            td {
              border: 1px solid #e2e8f0;
              padding: 10px;
              text-align: left;
              font-size: 12.5px;
            }

            th {
              background: #f8fafc;
              font-weight: 600;
              color: #475569;
            }

            code,
            .doc-code {
              font-family: monospace;
              font-size: 12px;
              background: #f1f5f9;
              padding: 2px 4px;
              border-radius: 4px;
              color: #db2777;
            }

          </style>

        </head>

        <body>

          ${htmlContent}

          <script>
            window.onload = function() {
              window.print();

              setTimeout(
                function() {
                  window.close();
                },
                500
              );
            };
          </script>

        </body>

      </html>
    `);

    printWindow.document.close();
  };

  // ============================================================
  // UI
  // ============================================================

  return (
    <>
      <header className="navbar">

        {/* ======================================================
            BRAND
        ====================================================== */}

        <div className="nav-brand">

          <div className="nav-logo">

            <Sparkles
              size={15}
              color="white"
              strokeWidth={2.5}
            />

          </div>

          <span className="nav-brand-text">
            AI Architecture Agent
          </span>

        </div>

        {/* DIVIDER */}

        <div className="nav-vdiv" />

        {/* ======================================================
            CURRENT PROJECT
        ====================================================== */}

        <div className="nav-project-wrap">

          <div
            className="nav-project-btn"
            style={{
              cursor: 'default'
            }}
          >

            <div className="nav-proj-dot" />

            <span>
              {currentProject
                ? currentProject.name
                : 'No Project Selected'}
            </span>

          </div>

        </div>

        {/* ======================================================
            TAB SWITCHER
        ====================================================== */}

        {currentProject && (

          <nav className="nav-tabs">

            <button
              type="button"
              className={`nav-tab ${
                currentTab === 'chat'
                  ? 'active'
                  : ''
              }`}
              onClick={() =>
                setCurrentTab('chat')
              }
            >

              <MessageSquare size={14} />

              <span>
                AI Chat Assistant
              </span>

            </button>

            <button
              type="button"
              className={`nav-tab ${
                currentTab === 'board'
                  ? 'active'
                  : ''
              }`}
              onClick={() =>
                setCurrentTab('board')
              }
            >

              <Layout size={14} />

              <span>
                Design Canvas Board
              </span>

            </button>

          </nav>

        )}

        {/* SPACER */}

        <div style={{ flex: 1 }} />

        {/* ======================================================
            RIGHT ACTIONS
        ====================================================== */}

        <div
          className="nav-right"
          style={{
            position: 'relative'
          }}
        >

          {/* ====================================================
              EXPLAIN + EXPORT
          ==================================================== */}

          {hasGeneratedData && currentProject && (

            <>

              <button
                type="button"
                className="nav-icon-btn explain-btn"
                onClick={handleOpenWalkthrough}
                title="Explain Architecture"
                aria-label="Explain architecture"
              >

                <Sparkles size={15} />

                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    marginLeft: 6
                  }}
                >
                  Explain
                </span>

              </button>

              <button
                type="button"
                className="nav-icon-btn"
                onClick={handleExportPDF}
                title="Export PDF"
                aria-label="Export architecture documentation"
              >

                <FileText size={15} />

              </button>

            </>

          )}

          {/* ====================================================
              SEARCH
          ==================================================== */}

          <div
            style={{
              position: 'relative'
            }}
            ref={searchRef}
          >

            <button
              type="button"
              className={`nav-icon-btn ${
                showSearch
                  ? 'active'
                  : ''
              }`}
              onClick={() => {
                setShowSearch(
                  (value) => !value
                );

                setShowNotifications(false);
              }}
              title="Search Components/Schema"
              aria-label="Search architecture"
            >

              <Search size={15} />

            </button>

            {showSearch && (

              <div className="nav-search-dropdown">

                <div className="nav-search-header">

                  <Search
                    size={13}
                    color="#94a3b8"
                  />

                  <input
                    type="text"
                    className="nav-search-input"
                    placeholder="Search components, tables, routes..."
                    value={searchQuery}
                    onChange={(e) =>
                      setSearchQuery(
                        e.target.value
                      )
                    }
                    autoFocus
                  />

                  <button
                    type="button"
                    className="nav-search-close"
                    onClick={() => {
                      setShowSearch(false);
                      setSearchQuery('');
                    }}
                    aria-label="Close search"
                  >

                    <X size={13} />

                  </button>

                </div>

                <div className="nav-search-results">

                  {(() => {
                    const q =
                      searchQuery
                        .toLowerCase()
                        .trim();

                    if (!q) {
                      return (
                        <div className="search-empty">
                          Type to search your architecture...
                        </div>
                      );
                    }

                    if (!generatedData) {
                      return (
                        <div className="search-empty">
                          Run the pipeline first to generate data.
                        </div>
                      );
                    }

                    const comps =
                      (
                        generatedData?.components ||
                        []
                      )
                        .filter((component) =>
                          component.name
                            ?.toLowerCase()
                            .includes(q)
                        )
                        .map((component) => ({
                          id: component.id,
                          name: component.name,
                          type: 'Component',
                          view: 'system'
                        }));

                    const tables =
                      (
                        generatedData?.database_schema ||
                        []
                      )
                        .filter((table) =>
                          table.name
                            ?.toLowerCase()
                            .includes(q)
                        )
                        .map((table) => ({
                          id: `table-${table.name}`,
                          name: table.name,
                          type: 'DB Table',
                          view: 'database'
                        }));

                    const apis =
                      (
                        generatedData?.apis ||
                        []
                      )
                        .filter(
                          (api) =>
                            api.path
                              ?.toLowerCase()
                              .includes(q) ||
                            api.method
                              ?.toLowerCase()
                              .includes(q)
                        )
                        .map((api, index) => ({
                          id: `ep-search-${index}`,
                          name:
                            `${api.method} ${api.path}`,
                          type: 'API Route',
                          view: 'apis'
                        }));

                    const all = [
                      ...comps,
                      ...tables,
                      ...apis
                    ];

                    if (all.length === 0) {
                      return (
                        <div className="search-empty">
                          No matches found for "
                          {searchQuery}"
                        </div>
                      );
                    }

                    return all.map(
                      (item, index) => (

                        <button
                          type="button"
                          key={`${item.type}-${item.id}-${index}`}
                          className="search-result-item"
                          onClick={() => {
                            useStore
                              .getState()
                              .setCanvasViewMode(
                                item.view
                              );

                            setCurrentTab(
                              'board'
                            );

                            if (
                              item.view ===
                              'system'
                            ) {
                              useStore
                                .getState()
                                .selectNode?.(
                                  item.id
                                );
                            }

                            useStore
                              .getState()
                              .addLog({
                                level: 'info',
                                message:
                                  `Focused on ${item.type}: ${item.name}`
                              });

                            setShowSearch(
                              false
                            );

                            setSearchQuery(
                              ''
                            );
                          }}
                        >

                          <span className="search-res-type">
                            {item.type}
                          </span>

                          <span className="search-res-name">
                            {item.name}
                          </span>

                        </button>

                      )
                    );
                  })()}

                </div>

              </div>

            )}

          </div>

          {/* ====================================================
              NOTIFICATIONS
          ==================================================== */}

          <div
            style={{
              position: 'relative'
            }}
            ref={notifRef}
          >

            <button
              type="button"
              className={`nav-icon-btn ${
                showNotifications
                  ? 'active'
                  : ''
              }`}
              onClick={() => {
                setShowNotifications(
                  (value) => !value
                );

                setShowSearch(false);
                setSearchQuery('');
              }}
              title="Notifications"
              aria-label="Notifications"
              style={{
                position: 'relative'
              }}
            >

              <Bell size={15} />

              {hasGeneratedData && (
                <span className="nav-bell-badge" />
              )}

            </button>

            {showNotifications && (

              <div className="nav-notifications-dropdown">

                <div className="notif-header">

                  <span>
                    Notifications
                  </span>

                  <button
                    type="button"
                    className="notif-close-btn"
                    onClick={() =>
                      setShowNotifications(
                        false
                      )
                    }
                    aria-label="Close notifications"
                  >

                    <X size={12} />

                  </button>

                </div>

                <div className="notif-list">

                  {hasGeneratedData ? (

                    <>

                      <div className="notif-item">

                        <div className="notif-dot green" />

                        <div className="notif-body">

                          <p className="notif-msg">
                            Pipeline complete — architecture ready
                          </p>

                          <span className="notif-time">
                            Just now
                          </span>

                        </div>

                      </div>

                      <div className="notif-item">

                        <div className="notif-dot blue" />

                        <div className="notif-body">

                          <p className="notif-msg">
                            Documentation generated in Docs tab
                          </p>

                          <span className="notif-time">
                            Just now
                          </span>

                        </div>

                      </div>

                      <div className="notif-item">

                        <div className="notif-dot purple" />

                        <div className="notif-body">

                          <p className="notif-msg">
                            Security audit passed
                          </p>

                          <span className="notif-time">
                            Just now
                          </span>

                        </div>

                      </div>

                      <div className="notif-item">

                        <div className="notif-dot orange" />

                        <div className="notif-body">

                          <p className="notif-msg">
                            Cost estimate: $63.25/month
                          </p>

                          <span className="notif-time">
                            Just now
                          </span>

                        </div>

                      </div>

                    </>

                  ) : (

                    <div className="notif-empty">
                      No notifications yet. Run the pipeline to start!
                    </div>

                  )}

                </div>

              </div>

            )}

          </div>

          <div className="nav-vdiv" />

          {/* ====================================================
              FILE INPUT
          ==================================================== */}

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".pdf,.txt,.docx,.json,.md"
            multiple
            style={{
              display: 'none'
            }}
          />

          {/* ====================================================
              UPLOADED DOCUMENTS
          ==================================================== */}

          {uploadedDocuments &&
          uploadedDocuments.length > 0 ? (

            <div
              className="nav-docs-list"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >

              {uploadedDocuments.map(
                (doc, index) => (

                  <button
                    type="button"
                    key={doc.id || index}
                    className="nav-doc-loaded"
                    onClick={() =>
                      fileInputRef.current?.click()
                    }
                    title={`${doc.name} — Click to add or replace`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '5px 10px',
                      background: '#f0fdf4',
                      border:
                        '1px solid #bbf7d0',
                      borderRadius: '7px',
                      cursor: 'pointer'
                    }}
                  >

                    <CheckCircle2
                      size={13}
                      color="#22c55e"
                    />

                    <span
                      style={{
                        fontSize: '11.5px',
                        color: '#166534',
                        fontWeight: 600
                      }}
                    >

                      {doc.name.length > 15
                        ? `${doc.name.slice(
                            0,
                            15
                          )}…`
                        : doc.name}

                    </span>

                  </button>

                )
              )}

              <button
                type="button"
                className="nav-upload-more"
                onClick={() =>
                  fileInputRef.current?.click()
                }
                title="Add more documents"
                aria-label="Add more documents"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '26px',
                  height: '26px',
                  borderRadius: '50%',
                  border:
                    '1px dashed #cbd5e1',
                  background: '#f8fafc',
                  color: '#64748b',
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
              >

                <Plus size={14} />

              </button>

            </div>

          ) : (

            currentProject && (

              <button
                type="button"
                className="nav-upload-btn"
                onClick={() =>
                  fileInputRef.current?.click()
                }
              >

                <UploadCloud size={14} />

                <span>
                  Upload Document
                </span>

              </button>

            )

          )}

        </div>

      </header>

      {/* ========================================================
          CREATE PROJECT MODAL
      ======================================================== */}

      {showCreate && (

        <div
          className="modal-overlay"
          onClick={() =>
            setShowCreate(false)
          }
        >

          <div
            className="modal-card"
            onClick={(e) =>
              e.stopPropagation()
            }
          >

            <div className="modal-header">

              <div className="modal-icon">

                <Sparkles
                  size={18}
                  color="white"
                />

              </div>

              <div>

                <h3 className="modal-title">
                  New Project
                </h3>

                <p className="modal-sub">
                  Set up a new architecture workspace
                </p>

              </div>

            </div>

            <form
              onSubmit={handleCreate}
              className="modal-form"
            >

              <div className="form-group">

                <label>
                  Project Name
                </label>

                <input
                  type="text"
                  placeholder="e.g. NextGen E-commerce Platform"
                  value={name}
                  onChange={(e) =>
                    setName(
                      e.target.value
                    )
                  }
                  required
                />

              </div>

              <div className="form-group">

                <label>
                  Architecture Goals (optional)
                </label>

                <textarea
                  placeholder="Describe your requirements..."
                  value={desc}
                  onChange={(e) =>
                    setDesc(
                      e.target.value
                    )
                  }
                  rows={3}
                />

              </div>

              <div className="modal-actions">

                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() =>
                    setShowCreate(false)
                  }
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="btn-create"
                >

                  <Zap size={14} />

                  Create Project

                </button>

              </div>

            </form>

          </div>

        </div>

      )}

      {/* ========================================================
          ARCHITECTURE WALKTHROUGH MODAL
      ======================================================== */}

      {showWalkthrough && currentProject && (

        <ArchitectureWalkthroughModal
          onClose={handleCloseWalkthrough}
        />

      )}

    </>
  );
}