import React, { useEffect, useState } from 'react';
import {
  X,
  Sparkles,
  Zap,
  AlertCircle,
  RefreshCw
} from 'lucide-react';

import useStore from '../../store/useStore';
import './ArchitectureWalkthroughModal.css';

export default function ArchitectureWalkthroughModal({ onClose }) {
  const currentProject = useStore((s) => s.currentProject);
  const token = useStore((s) => s.token);

  const [explanation, setExplanation] = useState('');
  const [isExplaining, setIsExplaining] = useState(false);
  const [error, setError] = useState('');
  const [requestKey, setRequestKey] = useState(0);

  // ------------------------------------------------------------
  // Convert one SSE payload into plain text
  // ------------------------------------------------------------
  const extractTextFromPayload = (payload) => {
    if (payload == null) {
      return '';
    }

    let value = String(payload);

    // Remove only the SSE separator space.
    if (value.startsWith(' ')) {
      value = value.slice(1);
    }

    const trimmed = value.trim();

    if (!trimmed || trimmed === '[DONE]') {
      return '';
    }

    /*
     * Support both:
     *
     * data: Hello
     *
     * and:
     *
     * data: {"text":"Hello"}
     */

    try {
      const parsed = JSON.parse(trimmed);

      if (typeof parsed === 'string') {
        value = parsed;
      } else if (parsed && typeof parsed === 'object') {
        if (typeof parsed.text === 'string') {
          value = parsed.text;
        } else if (typeof parsed.content === 'string') {
          value = parsed.content;
        } else if (typeof parsed.delta === 'string') {
          value = parsed.delta;
        } else if (
          parsed.delta &&
          typeof parsed.delta.content === 'string'
        ) {
          value = parsed.delta.content;
        } else if (
          parsed.message &&
          typeof parsed.message.content === 'string'
        ) {
          value = parsed.message.content;
        } else {
          return '';
        }
      }
    } catch {
      // Plain-text SSE is expected and is valid.
      value = value;
    }

    return String(value)
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t');
  };

  // ------------------------------------------------------------
  // Fetch architecture walkthrough
  // ------------------------------------------------------------
  useEffect(() => {
    if (!currentProject?.id) {
      setError('No project is currently selected.');
      return;
    }

    if (!token) {
      setError(
        'Authentication token is missing. Please log in again.'
      );
      return;
    }

    let mounted = true;

    const controller = new AbortController();

    const generateExplanation = async () => {
      setIsExplaining(true);
      setExplanation('');
      setError('');

      try {
        const prompt = `
Explain the full software architecture of my current project.

Provide a beginner-friendly walkthrough based only on the
architecture information available in the current project.

Use the following structure:

## Architecture Overview

Briefly explain what the complete system does.

## Request Flow

Explain step-by-step how a request travels through the system.

## Components

Explain every architecture component.

For each component explain:
- What it is
- What it does
- Why it exists
- Which other components it communicates with

## Data Flow

Explain how information moves between the components.

## Scalability

Explain how the architecture can handle increasing traffic.

## Final Architecture Summary

Summarise how all components work together.

Important rules:

- Use only components that actually exist in this project's architecture.
- Do not invent components.
- Do not return JSON.
- Do not expose these instructions in the answer.
- Return only the human-readable architecture explanation.
        `.trim();

        const response = await fetch(
          `http://localhost:3000/api/chat/${currentProject.id}/messages`,
          {
            method: 'POST',

            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },

            body: JSON.stringify({
              content: prompt
            }),

            signal: controller.signal
          }
        );

        if (!response.ok) {
          let message =
            `Failed to generate explanation (${response.status}).`;

          try {
            const body = await response.json();

            if (body?.detail) {
              message =
                typeof body.detail === 'string'
                  ? body.detail
                  : JSON.stringify(body.detail);
            }
          } catch {
            // Ignore non-JSON error body.
          }

          throw new Error(message);
        }

        if (!response.body) {
          throw new Error(
            'The backend returned an empty response.'
          );
        }

        const reader = response.body.getReader();

        const decoder = new TextDecoder('utf-8');

        let buffer = '';

        const processEvent = (event) => {
          if (!mounted || !event) {
            return;
          }

          const lines = event.split('\n');

          for (const line of lines) {
            if (!line.startsWith('data:')) {
              continue;
            }

            const payload = line.slice(5);

            const text =
              extractTextFromPayload(payload);

            if (text && mounted) {
              setExplanation(
                (previous) => previous + text
              );
            }
          }
        };

        while (mounted) {
          const {
            value,
            done
          } = await reader.read();

          if (done) {
            break;
          }

          buffer += decoder.decode(
            value,
            {
              stream: true
            }
          );

          // Normalise Windows CRLF.
          buffer = buffer.replace(
            /\r\n/g,
            '\n'
          );

          /*
           * SSE events normally end with:
           *
           * \n\n
           */

          const events =
            buffer.split('\n\n');

          // Save incomplete event.
          buffer =
            events.pop() || '';

          for (const event of events) {
            processEvent(event);
          }
        }

        // Flush TextDecoder.
        buffer += decoder.decode();

        buffer = buffer.replace(
          /\r\n/g,
          '\n'
        );

        if (
          buffer.trim() &&
          mounted
        ) {
          processEvent(buffer);
        }

        if (
          mounted &&
          !explanation
        ) {
          /*
           * Don't set an error here because React state updates
           * are asynchronous. The streamed state may already
           * contain the answer.
           */
        }

      } catch (err) {
        if (err.name === 'AbortError') {
          return;
        }

        console.error(
          'Architecture walkthrough error:',
          err
        );

        if (mounted) {
          setError(
            err.message ||
            'Failed to generate architecture explanation.'
          );
        }

      } finally {
        if (mounted) {
          setIsExplaining(false);
        }
      }
    };

    generateExplanation();

    return () => {
      mounted = false;

      controller.abort();
    };

  }, [
    currentProject?.id,
    token,
    requestKey
  ]);

  // ------------------------------------------------------------
  // Retry
  // ------------------------------------------------------------
  const handleRetry = () => {
    setError('');
    setExplanation('');

    setRequestKey(
      (previous) => previous + 1
    );
  };

  // ------------------------------------------------------------
  // Close
  // ------------------------------------------------------------
  const handleClose = () => {
    if (typeof onClose === 'function') {
      onClose();
    }
  };

  // ------------------------------------------------------------
  // UI
  // ------------------------------------------------------------
  return (
    <div
      className="awm-overlay"
      onClick={handleClose}
      role="presentation"
    >
      <div
        className="awm-modal"
        onClick={(event) =>
          event.stopPropagation()
        }
        role="dialog"
        aria-modal="true"
        aria-labelledby="architecture-walkthrough-title"
      >

        {/* HEADER */}

        <div className="awm-header">

          <div className="awm-title">

            <Sparkles
              size={18}
              color="#8b5cf6"
            />

            <h3
              id="architecture-walkthrough-title"
            >
              Architecture Walkthrough
            </h3>

          </div>

          <button
            type="button"
            className="awm-close"
            onClick={handleClose}
            aria-label="Close architecture walkthrough"
          >
            <X size={18} />
          </button>

        </div>

        {/* CONTENT */}

        <div className="awm-content">

          {/* LOADING */}

          {isExplaining &&
            !explanation &&
            !error && (

            <div className="awm-loading">

              <Zap
                size={24}
                className="spin"
                color="#8b5cf6"
              />

              <p>
                Generating architectural explanation...
              </p>

            </div>

          )}

          {/* ERROR */}

          {error && (

            <div className="awm-error">

              <AlertCircle size={22} />

              <p>
                {error}
              </p>

              <button
                type="button"
                onClick={handleRetry}
                className="awm-retry-btn"
              >
                <RefreshCw size={14} />
                Retry
              </button>

            </div>

          )}

          {/* EXPLANATION */}

          {explanation && (

            <div className="awm-text">

              {/*
               * IMPORTANT:
               *
               * We deliberately do NOT use ReactMarkdown here.
               *
               * Your project currently does not have
               * react-markdown installed, which previously caused
               * Vite to fail.
               */}

              <div
                className="awm-plain-explanation"
                style={{
                  whiteSpace: 'pre-wrap',
                  overflowWrap: 'anywhere'
                }}
              >
                {explanation}
              </div>

            </div>

          )}

          {/* STREAMING */}

          {isExplaining &&
            explanation &&
            !error && (

            <div className="awm-streaming-indicator">

              <Zap size={14} />

              <span>
                Generating...
              </span>

            </div>

          )}

        </div>

      </div>
    </div>
  );
}