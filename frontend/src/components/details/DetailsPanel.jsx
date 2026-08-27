import React, { useState } from 'react';
import {
  X,
  Sparkles,
  Database,
  DollarSign,
  Shield,
  Zap,
  MousePointer
} from 'lucide-react';

import useStore from '../../store/useStore';
import './DetailsPanel.css';

export default function DetailsPanel() {
  const selectedNode = useStore((s) => s.selectedNode);
  const setSelectedNode = useStore((s) => s.setSelectedNode);
  const costData = useStore((s) => s.costData);
  const securityFindings = useStore((s) => s.securityFindings);
  const currentProject = useStore((s) => s.currentProject);
  const addLog = useStore((s) => s.addLog);
  const token = useStore((s) => s.token);

  const [explanation, setExplanation] = useState('');
  const [isExplaining, setIsExplaining] = useState(false);

  const handleExplain = async () => {
    // Make sure a component and project are selected
    if (!selectedNode || !currentProject) {
      return;
    }

    // Make sure the user is authenticated
    if (!token) {
      console.error('Authentication token is missing.');

      addLog({
        level: 'error',
        message: 'Authentication token is missing. Please log in again.'
      });

      return;
    }

    setIsExplaining(true);
    setExplanation('');

    try {
      const componentName =
        selectedNode.data?.name ||
        selectedNode.id ||
        'selected architecture component';

      const res = await fetch(
        `http://localhost:3000/api/chat/${currentProject.id}/messages`,
        {
          method: 'POST',

          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },

          // IMPORTANT:
          // Backend ChatMessageCreate expects "content", not "message"
          body: JSON.stringify({
            content: `Explain the architecture component: ${componentName}`
          })
        }
      );

      // Handle backend errors
      if (!res.ok) {
        let errorMessage = `Failed to fetch explanation (${res.status})`;

        try {
          const errorData = await res.json();

          if (errorData?.detail) {
            errorMessage =
              typeof errorData.detail === 'string'
                ? errorData.detail
                : JSON.stringify(errorData.detail);
          }
        } catch {
          // Response may not be JSON
        }

        throw new Error(errorMessage);
      }

      // Make sure the backend returned a stream
      if (!res.body) {
        throw new Error('Backend returned no response stream.');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        // Decode streamed bytes
        buffer += decoder.decode(value, { stream: true });

        /*
         * Backend sends Server-Sent Events like:
         *
         * data: Web Server
         *
         * data: handles incoming
         *
         * data: requests...
         */

        const events = buffer.split('\n\n');

        // Keep incomplete event for next chunk
        buffer = events.pop() || '';

        for (const event of events) {
          const lines = event.split('\n');

          for (const line of lines) {
            if (!line.startsWith('data:')) {
              continue;
            }

            let text = line.slice(5);

            // Remove one SSE separator space
            if (text.startsWith(' ')) {
              text = text.slice(1);
            }

            // Ignore optional stream completion marker
            if (text === '[DONE]') {
              continue;
            }

            // Backend escapes newlines as "\\n"
            text = text.replace(/\\n/g, '\n');

            if (text) {
              setExplanation((prev) => prev + text);
            }
          }
        }
      }

      // Process any remaining buffered SSE data
      if (buffer.trim()) {
        const lines = buffer.split('\n');

        for (const line of lines) {
          if (line.startsWith('data:')) {
            let text = line.slice(5);

            if (text.startsWith(' ')) {
              text = text.slice(1);
            }

            if (text && text !== '[DONE]') {
              text = text.replace(/\\n/g, '\n');

              setExplanation((prev) => prev + text);
            }
          }
        }
      }

      addLog({
        level: 'info',
        message: `Generated AI explanation for ${componentName}`
      });

    } catch (error) {
      console.error('Explain component error:', error);

      setExplanation(
        `Unable to generate explanation. ${error.message || 'Please try again.'}`
      );

      addLog({
        level: 'error',
        message: `Failed to explain component: ${
          error.message || 'Unknown error'
        }`
      });

    } finally {
      setIsExplaining(false);
    }
  };

  if (!selectedNode) {
    return (
      <div className="details-panel empty">
        <div className="dp-empty-content">
          <MousePointer size={32} />

          <h3>No Component Selected</h3>

          <p>Click any node to inspect it</p>
        </div>
      </div>
    );
  }

  const { data, type } = selectedNode;

  const compCost = costData?.per_component?.find(
    (c) =>
      c.component_id === selectedNode.id ||
      c.name === data.name
  );

  const compSec = (securityFindings || []).filter((f) =>
    f.resource
      ?.toLowerCase()
      .includes(
        data.name
          ?.toLowerCase()
          .replace(/\s+/g, '_')
      )
  );

  return (
    <div className="details-panel">

      <div className="dp-header">

        <h2>{data.name || 'Component'}</h2>

        <button
          className="dp-close"
          onClick={() => setSelectedNode(null)}
        >
          <X size={16} />
        </button>

      </div>

      <div className="dp-content">

        {type === 'systemComponentNode' && (
          <div className="dp-section">

            <div className="dp-badges">

              <span className="dp-badge type">
                {data.type}
              </span>

              {compCost && (
                <span className="dp-badge cost">
                  <DollarSign size={12} />
                  ${compCost.monthly_usd}/mo
                </span>
              )}

              {compSec.length > 0 && (
                <span className="dp-badge security">
                  <Shield size={12} />
                  {compSec.length} Issues
                </span>
              )}

            </div>

            <p className="dp-desc">
              {data.description}
            </p>

            <button
              className="dp-explain-btn"
              onClick={handleExplain}
              disabled={isExplaining}
            >

              {isExplaining ? (
                <>
                  <Zap
                    size={14}
                    className="spin"
                  />
                  Explaining...
                </>
              ) : (
                <>
                  <Sparkles size={14} />
                  Explain ✨
                </>
              )}

            </button>

            {explanation && (
              <div className="dp-explanation">
                {explanation}
              </div>
            )}

          </div>
        )}

        {type === 'dbTableNode' && (
          <div className="dp-section">

            <div className="dp-badges">

              <span className="dp-badge type db">
                <Database size={12} />
                Table
              </span>

            </div>

            <div className="dp-columns">

              <h4>Columns</h4>

              {data.columns?.map((c, i) => (
                <div
                  key={i}
                  className="dp-col-row"
                >

                  <span className="dp-col-name">
                    {c.name}
                  </span>

                  <span className="dp-col-type">
                    {c.type}
                  </span>

                  {c.constraints?.includes('PRIMARY KEY') && (
                    <span className="dp-col-pk">
                      PK
                    </span>
                  )}

                  {c.constraints?.includes('FOREIGN KEY') && (
                    <span className="dp-col-fk">
                      FK
                    </span>
                  )}

                </div>
              ))}

            </div>

          </div>
        )}

        {type === 'apiEndpointNode' && (
          <div className="dp-section">

            <div className="dp-badges">

              <span
                className={`dp-badge method ${
                  data.method?.toLowerCase() || ''
                }`}
              >
                {data.method}
              </span>

            </div>

            <p className="dp-path">
              {data.path}
            </p>

            <p className="dp-desc">
              {data.description}
            </p>

          </div>
        )}

      </div>
    </div>
  );
}