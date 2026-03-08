// ============================================
// NOVA CLARITY — Core Application Logic
// ============================================

const ClarityApp = {

  // --- State ---
  state: {
    method: 'freeform',
    generating: false,
    outputs: null,
    usageCount: parseInt(localStorage.getItem('clarity_usage') || '0'),
    usageLimit: 3,
    apiKey: null, // Set via config for production
  },

  // --- Prompt Templates ---
  prompts: {
    system: `You are a Lead Business Analyst with 15+ years of experience in process mapping, documentation, and improvement. You work at Nova Insights & Solutions.

You are reviewing a process description as if a junior analyst brought it to you. Your job is not just to document what they said — it's to CHALLENGE it. Find the gaps, the dead-ends, the missing handoffs, the things they haven't thought about.

Your task is to take a description of a business process and produce FOUR outputs in a single JSON response:

1. "flowchart" — A swimlane process map. Return an object with:
   - "lanes": array of lane names (roles/departments involved), e.g. ["Customer", "Support Agent", "Manager"]
   - "nodes": array of node objects, each with:
     { "id": "n1", "type": "start"|"process"|"decision"|"end", "label": "Step description", "lane": "lane name from lanes array" }
   - "edges": array of connection objects:
     { "from": "n1", "to": "n2", "label": "optional label e.g. Yes/No/Approved/Rejected" }
   Decisions MUST have two outgoing edges (typically Yes/No paths).
   Use 8-20 nodes for a good level of detail. Every node must belong to a lane.

2. "sop" — A detailed Standard Operating Procedure in HTML format. Include:
   - Process title and purpose
   - Scope
   - Roles & responsibilities table
   - Step-by-step procedure (numbered)
   - Key decision points explained
   - Exceptions and edge cases
   Use proper HTML tags: <h3>, <p>, <ol>, <li>, <table>, <tr>, <th>, <td>

3. "gapAnalysis" — A structured gap analysis. This is the MOST IMPORTANT output. Think like a Lead BA reviewing a junior's work. Ask the hard questions. Return an object with:
   - "critical": array of objects — things that are genuinely missing or broken in the process. Each:
     { "question": "The direct question to ask", "context": "Why this matters and what could go wrong if not addressed" }
     Examples: "What happens if the customer never responds?", "Who owns this step when the manager is on leave?", "Does the process end here, or is there a downstream handoff?"
   - "unclear": array of objects — things that are ambiguous or need clarification. Each:
     { "question": "The direct question to ask", "context": "Why this needs clarifying" }
     Examples: "Is there a time limit on approval?", "What criteria determines whether this is high or low priority?", "Who has the authority to make exceptions?"
   - "optimisation": array of objects — opportunities to improve, automate, or streamline. Each:
     { "question": "The direct question to ask", "context": "What the opportunity is and the potential impact" }
     Examples: "Could this manual check be automated?", "Is this approval step adding value or just adding delay?", "Could these two handoffs be consolidated into one?"

   Aim for 3-6 items per category. Be SPECIFIC to the process described — no generic advice. Every question should make the reader think "oh, I hadn't considered that."

4. "improvements" — An array of improvement recommendations. Each:
   { "title": "Short title", "description": "Detailed explanation", "impact": "high"|"medium"|"low", "effort": "quick"|"medium"|"strategic", "category": "automation"|"elimination"|"simplification"|"standardisation"|"risk" }

Respond ONLY with valid JSON. No markdown, no code fences, just the JSON object with keys: flowchart, sop, gapAnalysis, improvements.`,

    userFreeform: (text) => `Here is a description of a business process. Please analyse it and produce the flowchart, SOP, and improvements.\n\n---\n${text}\n---`,

    userGuided: (data) => `Here is a business process described in a structured format. Please analyse it and produce the flowchart, SOP, and improvements.

Process Name: ${data.name}
Department/Team: ${data.department}
Process Owner: ${data.owner}
Trigger (what starts this process): ${data.trigger}
Steps (in order):
${data.steps}
End Result (what does completion look like): ${data.endResult}
Known Problems/Pain Points:
${data.painPoints}
Systems/Tools Used: ${data.systems}
---`
  },

  // --- Initialise ---
  init() {
    this.bindEvents();
    this.updateUsageDisplay();
    this.showMethod('freeform');
  },

  // --- Event Binding ---
  bindEvents() {
    // Method tabs
    document.querySelectorAll('.method-tab').forEach(tab => {
      tab.addEventListener('click', () => this.showMethod(tab.dataset.method));
    });

    // Output tabs
    document.querySelectorAll('.output-tab').forEach(tab => {
      tab.addEventListener('click', () => this.showOutput(tab.dataset.output));
    });

    // Generate button
    document.getElementById('btn-generate').addEventListener('click', () => this.generate());

    // Example chips
    document.querySelectorAll('.example-chip').forEach(chip => {
      chip.addEventListener('click', () => this.loadExample(chip.dataset.example));
    });

    // Export buttons
    document.getElementById('export-pdf')?.addEventListener('click', () => this.exportPDF());
    document.getElementById('export-md')?.addEventListener('click', () => this.exportMarkdown());
    document.getElementById('export-json')?.addEventListener('click', () => this.exportJSON());
  },

  // --- Methods ---
  showMethod(method) {
    this.state.method = method;
    document.querySelectorAll('.method-tab').forEach(t => t.classList.toggle('active', t.dataset.method === method));
    document.querySelectorAll('.method-panel').forEach(p => p.classList.toggle('active', p.id === `method-${method}`));
  },

  showOutput(panel) {
    document.querySelectorAll('.output-tab').forEach(t => t.classList.toggle('active', t.dataset.output === panel));
    document.querySelectorAll('.output-panel').forEach(p => p.classList.toggle('active', p.id === `panel-${panel}`));
  },

  updateUsageDisplay() {
    const el = document.getElementById('usage-count');
    if (el) {
      const remaining = Math.max(0, this.state.usageLimit - this.state.usageCount);
      el.innerHTML = `<strong>${remaining}</strong>/${this.state.usageLimit} free`;
    }
  },

  // --- Input Gathering ---
  getInput() {
    if (this.state.method === 'freeform') {
      const text = document.getElementById('freeform-input').value.trim();
      if (!text) { alert('Please describe your process first.'); return null; }
      if (text.length < 30) { alert('Please provide more detail about your process (at least a few sentences).'); return null; }
      return this.prompts.userFreeform(text);
    } else {
      const data = {
        name: document.getElementById('g-name').value.trim(),
        department: document.getElementById('g-department').value.trim(),
        owner: document.getElementById('g-owner').value.trim(),
        trigger: document.getElementById('g-trigger').value.trim(),
        steps: document.getElementById('g-steps').value.trim(),
        endResult: document.getElementById('g-end').value.trim(),
        painPoints: document.getElementById('g-pain').value.trim(),
        systems: document.getElementById('g-systems').value.trim(),
      };
      if (!data.name || !data.steps) { alert('Please fill in at least the process name and steps.'); return null; }
      return this.prompts.userGuided(data);
    }
  },

  // --- Generation ---
  async generate() {
    if (this.state.generating) return;

    const userMessage = this.getInput();
    if (!userMessage) return;

    // Check usage
    if (this.state.usageCount >= this.state.usageLimit && !this.state.apiKey) {
      this.showUpgradePrompt();
      return;
    }

    const btn = document.getElementById('btn-generate');
    btn.classList.add('loading');
    btn.disabled = true;
    this.state.generating = true;

    try {
      const result = await this.callAI(userMessage);
      this.state.outputs = result;
      this.renderOutputs(result);
      this.state.usageCount++;
      localStorage.setItem('clarity_usage', this.state.usageCount.toString());
      this.updateUsageDisplay();
    } catch (err) {
      console.error('Generation failed:', err);
      this.showError(err.message || 'Something went wrong. Please try again.');
    } finally {
      btn.classList.remove('loading');
      btn.disabled = false;
      this.state.generating = false;
    }
  },

  // --- AI Call ---
  async callAI(userMessage) {
    // Check for API backend or direct mode
    const backendUrl = window.CLARITY_API_URL;

    if (backendUrl) {
      // Production: call our serverless backend (Cloudflare Worker / Vercel Edge)
      const response = await fetch(backendUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: this.prompts.system },
            { role: 'user', content: userMessage }
          ]
        })
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `API error (${response.status})`);
      }

      const data = await response.json();
      return this.parseAIResponse(data.content);

    } else if (window.CLARITY_OR_KEY) {
      // MVP direct mode: call OpenRouter directly (for testing/early launch)
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${window.CLARITY_OR_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': window.location.origin,
          'X-Title': 'Clarity by Nova',
        },
        body: JSON.stringify({
          model: 'google/gemini-3.1-flash-lite-preview',
          messages: [
            { role: 'system', content: this.prompts.system },
            { role: 'user', content: userMessage }
          ],
          max_tokens: 8000,
          temperature: 0.3,
        })
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `AI service error (${response.status})`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error('Empty response from AI. Please try again.');
      return this.parseAIResponse(content);

    } else {
      throw new Error('No API configured. Running in demo mode.');
    }
  },

  parseAIResponse(raw) {
    let parsed;
    try {
      const content = typeof raw === 'string' ? raw : JSON.stringify(raw);
      // Strip any markdown code fences if present
      const clean = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(clean);
    } catch (e) {
      throw new Error('Failed to parse AI response. Please try again.');
    }

    if (!parsed.flowchart || !parsed.sop || !parsed.improvements || !parsed.gapAnalysis) {
      throw new Error('Incomplete response from AI. Please try again.');
    }

    return parsed;
  },

  // --- Rendering ---
  renderOutputs(data) {
    // Show output section
    document.getElementById('output-section').classList.add('visible');

    // Render flowchart
    this.renderFlowchart(data.flowchart);

    // Render SOP
    document.getElementById('sop-content').innerHTML = data.sop;

    // Render gap analysis
    this.renderGapAnalysis(data.gapAnalysis);

    // Render improvements
    this.renderImprovements(data.improvements);

    // Scroll to output
    document.getElementById('output-section').scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Default to flowchart tab
    this.showOutput('flowchart');
  },

  renderFlowchart(data) {
    const container = document.getElementById('flowchart-content');

    // Support both old format (array) and new swimlane format (object with lanes/nodes/edges)
    if (Array.isArray(data)) {
      // Legacy format fallback
      this.renderSimpleFlowchart(data, container);
      return;
    }

    const { lanes = [], nodes = [], edges = [] } = data;
    if (!lanes.length || !nodes.length) {
      this.renderSimpleFlowchart(nodes, container);
      return;
    }

    // --- Layout constants ---
    const LANE_WIDTH = 220;
    const NODE_H = 44;
    const NODE_W = 180;
    const ROW_GAP = 80;
    const HEADER_H = 44;
    const PAD_TOP = 20;
    const PAD_BOTTOM = 30;
    const PAD_LEFT = 10;
    const DECISION_SIZE = 56;

    // Build node lookup
    const nodeMap = {};
    nodes.forEach(n => { nodeMap[n.id] = n; });

    // Assign columns (lane index)
    const laneIndex = {};
    lanes.forEach((l, i) => { laneIndex[l] = i; });

    // Topological sort for row assignment
    const inDegree = {};
    const adj = {};
    nodes.forEach(n => { inDegree[n.id] = 0; adj[n.id] = []; });
    edges.forEach(e => {
      if (adj[e.from]) adj[e.from].push(e.to);
      if (inDegree[e.to] !== undefined) inDegree[e.to]++;
    });

    const queue = nodes.filter(n => inDegree[n.id] === 0).map(n => n.id);
    const rowAssign = {};
    let maxRow = 0;

    // BFS to assign rows
    const visited = new Set();
    let bfsQueue = [...queue];
    bfsQueue.forEach(id => { rowAssign[id] = 0; });

    while (bfsQueue.length > 0) {
      const current = bfsQueue.shift();
      if (visited.has(current)) continue;
      visited.add(current);
      const currentRow = rowAssign[current] || 0;

      (adj[current] || []).forEach(next => {
        const nextRow = currentRow + 1;
        rowAssign[next] = Math.max(rowAssign[next] || 0, nextRow);
        maxRow = Math.max(maxRow, nextRow);
        inDegree[next]--;
        if (inDegree[next] <= 0) bfsQueue.push(next);
      });
    }

    // Handle unvisited nodes
    nodes.forEach(n => {
      if (rowAssign[n.id] === undefined) {
        maxRow++;
        rowAssign[n.id] = maxRow;
      }
    });

    // Calculate positions
    const totalW = PAD_LEFT + lanes.length * LANE_WIDTH + PAD_LEFT;
    const totalH = HEADER_H + PAD_TOP + (maxRow + 1) * ROW_GAP + PAD_BOTTOM;

    const getX = (node) => PAD_LEFT + (laneIndex[node.lane] || 0) * LANE_WIDTH + LANE_WIDTH / 2;
    const getY = (node) => HEADER_H + PAD_TOP + (rowAssign[node.id] || 0) * ROW_GAP + NODE_H / 2;

    // --- Build SVG ---
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${totalH}" class="flowchart-svg" style="width:100%;max-width:${totalW}px;height:auto;font-family:Inter,sans-serif;">`;

    // Background
    svg += `<rect width="${totalW}" height="${totalH}" fill="#F8FAFB" rx="8"/>`;

    // Lane headers and columns
    lanes.forEach((lane, i) => {
      const x = PAD_LEFT + i * LANE_WIDTH;
      // Lane background (alternating)
      if (i % 2 === 1) {
        svg += `<rect x="${x}" y="${HEADER_H}" width="${LANE_WIDTH}" height="${totalH - HEADER_H}" fill="rgba(0,180,216,0.03)"/>`;
      }
      // Lane divider
      if (i > 0) {
        svg += `<line x1="${x}" y1="${HEADER_H}" x2="${x}" y2="${totalH}" stroke="#E8ECF0" stroke-width="1" stroke-dasharray="4,4"/>`;
      }
      // Lane header
      svg += `<rect x="${x}" y="0" width="${LANE_WIDTH}" height="${HEADER_H}" fill="#0B1D3A" ${i === 0 ? 'rx="8" ry="8"' : ''} ${i === lanes.length - 1 ? 'rx="8" ry="8"' : ''}/>`;
      // Fix corners for middle lanes
      if (i > 0 && i < lanes.length - 1) {
        svg += `<rect x="${x}" y="0" width="${LANE_WIDTH}" height="${HEADER_H}" fill="#0B1D3A"/>`;
      }
      // First lane - round top-left
      if (i === 0) {
        svg += `<rect x="${x}" y="0" width="${LANE_WIDTH}" height="${HEADER_H}" fill="#0B1D3A" rx="8"/>`;
        svg += `<rect x="${x}" y="8" width="${LANE_WIDTH}" height="${HEADER_H - 8}" fill="#0B1D3A"/>`;
      }
      // Last lane - round top-right
      if (i === lanes.length - 1) {
        svg += `<rect x="${x}" y="0" width="${LANE_WIDTH}" height="${HEADER_H}" fill="#0B1D3A" rx="8"/>`;
        svg += `<rect x="${x}" y="8" width="${LANE_WIDTH}" height="${HEADER_H - 8}" fill="#0B1D3A"/>`;
      }
      // Middle lanes - no rounding
      if (i > 0 && i < lanes.length - 1) {
        svg += `<rect x="${x}" y="0" width="${LANE_WIDTH}" height="${HEADER_H}" fill="#0B1D3A"/>`;
      }
      // Lane label
      svg += `<text x="${x + LANE_WIDTH / 2}" y="${HEADER_H / 2 + 1}" text-anchor="middle" dominant-baseline="middle" fill="white" font-size="12" font-weight="700">${this.escSvg(lane)}</text>`;
    });

    // Edges (draw before nodes so they appear behind)
    const drawnEdges = [];
    edges.forEach(e => {
      const fromNode = nodeMap[e.from];
      const toNode = nodeMap[e.to];
      if (!fromNode || !toNode) return;

      const x1 = getX(fromNode);
      const y1 = getY(fromNode) + (fromNode.type === 'decision' ? DECISION_SIZE / 2 : NODE_H / 2);
      const x2 = getX(toNode);
      const y2 = getY(toNode) - (toNode.type === 'decision' ? DECISION_SIZE / 2 : NODE_H / 2);

      // Determine path
      let path;
      if (Math.abs(x1 - x2) < 5) {
        // Straight vertical
        path = `M${x1},${y1} L${x2},${y2}`;
      } else {
        // L-shaped or curved path across lanes
        const midY = y1 + (y2 - y1) / 2;
        path = `M${x1},${y1} L${x1},${midY} L${x2},${midY} L${x2},${y2}`;
      }

      svg += `<path d="${path}" fill="none" stroke="#B0BAC4" stroke-width="1.5" marker-end="url(#arrowhead)"/>`;

      // Edge label
      if (e.label) {
        const lx = Math.abs(x1 - x2) < 5 ? x1 + 8 : (x1 + x2) / 2;
        const ly = (y1 + y2) / 2 - 4;
        svg += `<rect x="${lx - 18}" y="${ly - 9}" width="${Math.max(36, e.label.length * 6 + 12)}" height="18" rx="9" fill="#F0A500" opacity="0.9"/>`;
        svg += `<text x="${lx - 18 + Math.max(36, e.label.length * 6 + 12) / 2}" y="${ly + 2}" text-anchor="middle" dominant-baseline="middle" fill="#0B1D3A" font-size="9" font-weight="700">${this.escSvg(e.label)}</text>`;
      }
    });

    // Arrow marker definition
    svg += `<defs><marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="#B0BAC4"/></marker></defs>`;

    // Nodes
    nodes.forEach(n => {
      const cx = getX(n);
      const cy = getY(n);
      const label = this.wrapSvgText(n.label, 24);

      if (n.type === 'start' || n.type === 'end') {
        // Rounded pill
        const color = n.type === 'start' ? '#00B4D8' : '#0B1D3A';
        svg += `<rect x="${cx - NODE_W / 2}" y="${cy - NODE_H / 2}" width="${NODE_W}" height="${NODE_H}" rx="22" fill="${color}" filter="url(#shadow)"/>`;
        svg += `<text x="${cx}" y="${cy + 1}" text-anchor="middle" dominant-baseline="middle" fill="white" font-size="11" font-weight="600">${this.escSvg(n.label)}</text>`;
      } else if (n.type === 'decision') {
        // Diamond
        const s = DECISION_SIZE / 2;
        svg += `<polygon points="${cx},${cy - s} ${cx + s + 10},${cy} ${cx},${cy + s} ${cx - s - 10},${cy}" fill="#FEF3C7" stroke="#F0A500" stroke-width="2" filter="url(#shadow)"/>`;
        // Wrap text for diamond
        const lines = this.wrapSvgText(n.label, 18);
        const lineH = 11;
        const startY = cy - (lines.length - 1) * lineH / 2;
        lines.forEach((line, i) => {
          svg += `<text x="${cx}" y="${startY + i * lineH}" text-anchor="middle" dominant-baseline="middle" fill="#92400E" font-size="9.5" font-weight="600">${this.escSvg(line)}</text>`;
        });
      } else {
        // Process rectangle
        svg += `<rect x="${cx - NODE_W / 2}" y="${cy - NODE_H / 2}" width="${NODE_W}" height="${NODE_H}" rx="8" fill="white" stroke="#00B4D8" stroke-width="1.5" filter="url(#shadow)"/>`;
        // Wrap text
        const lines = this.wrapSvgText(n.label, 26);
        const lineH = 12;
        const startY = cy - (lines.length - 1) * lineH / 2;
        lines.forEach((line, i) => {
          svg += `<text x="${cx}" y="${startY + i * lineH + 1}" text-anchor="middle" dominant-baseline="middle" fill="#1A2332" font-size="10.5" font-weight="500">${this.escSvg(line)}</text>`;
        });
      }
    });

    // Drop shadow filter
    svg += `<defs><filter id="shadow" x="-4%" y="-4%" width="108%" height="112%"><feDropShadow dx="0" dy="1" stdDeviation="2" flood-color="#0B1D3A" flood-opacity="0.08"/></filter></defs>`;

    svg += '</svg>';
    container.innerHTML = svg;
  },

  // SVG text helpers
  escSvg(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },

  wrapSvgText(text, maxChars) {
    const words = text.split(' ');
    const lines = [];
    let current = '';
    words.forEach(word => {
      if ((current + ' ' + word).trim().length > maxChars && current) {
        lines.push(current.trim());
        current = word;
      } else {
        current = (current + ' ' + word).trim();
      }
    });
    if (current) lines.push(current.trim());
    return lines.length > 3 ? [...lines.slice(0, 2), lines.slice(2).join(' ').substring(0, maxChars) + '…'] : lines;
  },

  // Legacy simple flowchart (fallback for old format)
  renderSimpleFlowchart(steps, container) {
    if (!Array.isArray(steps)) { container.innerHTML = '<p style="color:var(--grey-500);text-align:center;">Unable to render flowchart</p>'; return; }
    let html = '<div style="display:flex;flex-direction:column;align-items:center;gap:0;">';
    steps.forEach((step, i) => {
      const typeClass = step.type || 'process';
      html += `<div class="flow-node"><div class="flow-box ${typeClass}">${step.label || step}</div></div>`;
      if (i < steps.length - 1) html += '<div class="flow-arrow"></div>';
    });
    html += '</div>';
    container.innerHTML = html;
  },

  renderImprovements(improvements) {
    const container = document.getElementById('improvements-content');
    let html = '';

    // Sort: quick wins first, then medium, then strategic
    const order = { quick: 0, medium: 1, strategic: 2 };
    const sorted = [...improvements].sort((a, b) => (order[a.effort] || 1) - (order[b.effort] || 1));

    sorted.forEach(imp => {
      const cardClass = imp.effort === 'quick' ? 'quick-win' : imp.effort === 'strategic' ? 'strategic' : '';
      const tagClass = imp.effort === 'quick' ? 'quick' : imp.effort === 'strategic' ? 'strategic-tag' : 'medium';
      const tagLabel = imp.effort === 'quick' ? '⚡ Quick Win' : imp.effort === 'strategic' ? '🎯 Strategic' : '🔧 Medium Effort';
      const impactBadge = imp.impact === 'high' ? '🔴 High Impact' : imp.impact === 'medium' ? '🟡 Medium Impact' : '🟢 Low Impact';

      html += `
        <div class="improvement-card ${cardClass}">
          <h4>
            ${imp.title}
            <span class="improvement-tag ${tagClass}">${tagLabel}</span>
          </h4>
          <p>${imp.description}</p>
          <div style="margin-top:0.5rem;font-size:0.8rem;color:var(--grey-500);">
            ${impactBadge} · Category: ${imp.category || 'general'}
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  },

  renderGapAnalysis(gapAnalysis) {
    const container = document.getElementById('gaps-content');

    const critical = gapAnalysis.critical || [];
    const unclear = gapAnalysis.unclear || [];
    const optimisation = gapAnalysis.optimisation || [];
    const totalGaps = critical.length + unclear.length + optimisation.length;

    let html = '';

    // Summary bar
    html += `
      <div class="gap-summary">
        <div class="gap-summary-stat">
          <div class="stat-number">${totalGaps}</div>
          <div class="stat-label">Total Questions</div>
        </div>
        <div class="gap-summary-stat">
          <div class="stat-number" style="color:var(--error);">${critical.length}</div>
          <div class="stat-label">Critical Gaps</div>
        </div>
        <div class="gap-summary-stat">
          <div class="stat-number" style="color:var(--warning);">${unclear.length}</div>
          <div class="stat-label">Unclear Areas</div>
        </div>
        <div class="gap-summary-stat">
          <div class="stat-number" style="color:var(--success);">${optimisation.length}</div>
          <div class="stat-label">Optimisation</div>
        </div>
      </div>
    `;

    // Critical gaps
    if (critical.length > 0) {
      html += `
        <div class="gap-group">
          <div class="gap-group-header">
            <span class="gap-icon">🔴</span>
            <h3>Critical Gaps</h3>
            <span class="gap-count">${critical.length}</span>
          </div>
      `;
      critical.forEach(gap => {
        html += `
          <div class="gap-card critical">
            <div class="gap-question">${gap.question}</div>
            <div class="gap-context">${gap.context}</div>
          </div>
        `;
      });
      html += '</div>';
    }

    // Unclear areas
    if (unclear.length > 0) {
      html += `
        <div class="gap-group">
          <div class="gap-group-header">
            <span class="gap-icon">🟡</span>
            <h3>Unclear Areas</h3>
            <span class="gap-count">${unclear.length}</span>
          </div>
      `;
      unclear.forEach(gap => {
        html += `
          <div class="gap-card unclear">
            <div class="gap-question">${gap.question}</div>
            <div class="gap-context">${gap.context}</div>
          </div>
        `;
      });
      html += '</div>';
    }

    // Optimisation opportunities
    if (optimisation.length > 0) {
      html += `
        <div class="gap-group">
          <div class="gap-group-header">
            <span class="gap-icon">🟢</span>
            <h3>Optimisation Opportunities</h3>
            <span class="gap-count">${optimisation.length}</span>
          </div>
      `;
      optimisation.forEach(gap => {
        html += `
          <div class="gap-card optimisation">
            <div class="gap-question">${gap.question}</div>
            <div class="gap-context">${gap.context}</div>
          </div>
        `;
      });
      html += '</div>';
    }

    container.innerHTML = html;
  },

  // --- Examples ---
  loadExample(key) {
    const examples = {
      onboarding: `New Employee Onboarding Process:

When a new hire is confirmed, HR sends them a welcome email with a start date. On day 1, they arrive at reception and are given a temporary badge. They're taken to IT to collect a laptop, but sometimes IT hasn't been notified so there's no laptop ready. Then they go to their desk, which also sometimes hasn't been set up.

Their manager is supposed to meet them for a 1-hour intro, but this often gets rescheduled. HR sends a pack of forms to sign — some paper, some digital — and the new hire has to complete mandatory training modules online within the first week.

After week 1, there's supposed to be a check-in with HR and the manager together, but this rarely happens. By week 4, a probation review should be scheduled. IT access to systems is requested by the manager via email, and usually takes 2-3 days to set up.

The whole process feels disjointed and new hires regularly say they felt lost in their first week.`,

      invoice: `Invoice Approval Process:

A supplier sends an invoice by email to the accounts team. The accounts assistant logs it into a spreadsheet and checks if there's a matching purchase order. If there's no PO, they email the department that ordered it to get one retrospectively (this can take days).

Once matched, invoices under £1,000 go straight to the Finance Manager for approval. Invoices between £1,000-£5,000 need Head of Department approval first, then Finance Manager. Over £5,000 needs the MD's approval too.

Approvers are supposed to review within 2 working days but often take a week or more. There are no automated reminders. The accounts assistant manually chases approvers by email and sometimes by walking to their desk.

Once approved, the accounts assistant enters the payment into the banking system. Payments are made on the 15th and last day of each month. Late approvals mean suppliers miss payment runs, leading to complaint calls.`,

      support: `Customer Support Ticket Handling:

Customers submit tickets through our website form, by email, or by phone. Phone calls are logged manually by the agent into Zendesk. Emails auto-create tickets but web form submissions sometimes don't sync properly and get lost.

Tickets are categorised as Low, Medium, or High priority by the first agent who sees them. There's no clear criteria for priority levels — it's based on gut feel. High priority tickets should get a response within 2 hours, medium within 8 hours, low within 24 hours. We miss these targets about 40% of the time.

Tickets are assigned to agents in a round-robin fashion, but there's no skill-based routing. Complex technical issues sometimes go to non-technical agents who then have to reassign them, wasting time.

Escalation happens by tagging a senior agent in Slack. There's no formal escalation path. Resolved tickets are closed by the agent but there's no customer satisfaction survey or follow-up process.`
    };

    const text = examples[key];
    if (text) {
      this.showMethod('freeform');
      document.getElementById('freeform-input').value = text;
      document.getElementById('freeform-input').focus();
    }
  },

  // --- Error & Upgrade ---
  showError(msg) {
    alert(msg); // Replace with toast notification in v2
  },

  showUpgradePrompt() {
    alert('You\'ve used all 3 free process analyses this month.\n\nUpgrade to Pro for unlimited access at £9/month.\n\nOr book a Process Clarity Sprint with Nova for the full expert experience: novainsights.co.uk');
  },

  // --- Export ---
  exportMarkdown() {
    if (!this.state.outputs) return;
    const { sop, improvements, gapAnalysis } = this.state.outputs;

    // Convert SOP HTML to rough markdown
    let md = '# Process Documentation\n\n';
    md += '## Standard Operating Procedure\n\n';
    md += sop.replace(/<h3>/g, '\n### ').replace(/<\/h3>/g, '\n')
            .replace(/<p>/g, '\n').replace(/<\/p>/g, '\n')
            .replace(/<li>/g, '- ').replace(/<\/li>/g, '\n')
            .replace(/<[^>]+>/g, '').trim();

    // Gap Analysis
    if (gapAnalysis) {
      md += '\n\n## ⚠️ Questions to Consider\n\n';
      if (gapAnalysis.critical && gapAnalysis.critical.length > 0) {
        md += '### 🔴 Critical Gaps\n\n';
        gapAnalysis.critical.forEach((gap, i) => {
          md += `${i + 1}. **${gap.question}**\n   ${gap.context}\n\n`;
        });
      }
      if (gapAnalysis.unclear && gapAnalysis.unclear.length > 0) {
        md += '### 🟡 Unclear Areas\n\n';
        gapAnalysis.unclear.forEach((gap, i) => {
          md += `${i + 1}. **${gap.question}**\n   ${gap.context}\n\n`;
        });
      }
      if (gapAnalysis.optimisation && gapAnalysis.optimisation.length > 0) {
        md += '### 🟢 Optimisation Opportunities\n\n';
        gapAnalysis.optimisation.forEach((gap, i) => {
          md += `${i + 1}. **${gap.question}**\n   ${gap.context}\n\n`;
        });
      }
    }

    md += '\n\n## Improvement Recommendations\n\n';
    improvements.forEach((imp, i) => {
      md += `### ${i + 1}. ${imp.title}\n`;
      md += `**Impact:** ${imp.impact} | **Effort:** ${imp.effort} | **Category:** ${imp.category}\n\n`;
      md += `${imp.description}\n\n`;
    });

    this.downloadFile('process-documentation.md', md, 'text/markdown');
  },

  exportJSON() {
    if (!this.state.outputs) return;
    this.downloadFile('process-documentation.json', JSON.stringify(this.state.outputs, null, 2), 'application/json');
  },

  exportPDF() {
    // In v2: use html2pdf.js or server-side generation
    alert('PDF export coming in the next update. For now, use your browser\'s Print → Save as PDF on the SOP tab.');
  },

  downloadFile(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  // --- Demo Mode (for MVP without backend) ---
  enableDemoMode() {
    // Override callAI with a demo response
    this.callAI = async (userMessage) => {
      // Simulate API delay
      await new Promise(r => setTimeout(r, 2500));
      return this.getDemoResponse();
    };
  },

  getDemoResponse() {
    return {
      flowchart: {
        lanes: ["Requestor", "Coordinator", "Reviewer", "Executor"],
        nodes: [
          { id: "n1", type: "start", label: "Request Submitted", lane: "Requestor" },
          { id: "n2", type: "process", label: "Log request in tracking system", lane: "Coordinator" },
          { id: "n3", type: "decision", label: "All info provided?", lane: "Coordinator" },
          { id: "n4", type: "process", label: "Return to requestor for details", lane: "Coordinator" },
          { id: "n5", type: "process", label: "Route to appropriate reviewer", lane: "Coordinator" },
          { id: "n6", type: "decision", label: "Request approved?", lane: "Reviewer" },
          { id: "n7", type: "process", label: "Send rejection with reasons", lane: "Reviewer" },
          { id: "n8", type: "process", label: "Complete approved action", lane: "Executor" },
          { id: "n9", type: "process", label: "Notify all stakeholders", lane: "Executor" },
          { id: "n10", type: "end", label: "Process Complete", lane: "Executor" }
        ],
        edges: [
          { from: "n1", to: "n2" },
          { from: "n2", to: "n3" },
          { from: "n3", to: "n4", label: "No" },
          { from: "n3", to: "n5", label: "Yes" },
          { from: "n4", to: "n1", label: "Resubmit" },
          { from: "n5", to: "n6" },
          { from: "n6", to: "n7", label: "Rejected" },
          { from: "n6", to: "n8", label: "Approved" },
          { from: "n8", to: "n9" },
          { from: "n9", to: "n10" }
        ]
      },
      sop: `<h3>Standard Operating Procedure</h3>
<p><strong>Purpose:</strong> This SOP defines the standard process for handling and completing the described workflow, ensuring consistency, quality, and accountability at every stage.</p>

<h3>Scope</h3>
<p>This procedure applies to all team members involved in processing, reviewing, and completing requests within this workflow.</p>

<h3>Roles & Responsibilities</h3>
<table>
<tr><th>Role</th><th>Responsibility</th></tr>
<tr><td>Requestor</td><td>Submits the initial request with all required information</td></tr>
<tr><td>Coordinator</td><td>Logs, validates, and routes the request</td></tr>
<tr><td>Reviewer/Approver</td><td>Reviews request and makes approval decision</td></tr>
<tr><td>Executor</td><td>Completes the approved action</td></tr>
</table>

<h3>Procedure</h3>
<ol>
<li><strong>Request Submission:</strong> The requestor submits their request through the designated channel. All mandatory fields must be completed.</li>
<li><strong>Logging & Validation:</strong> The coordinator logs the request in the tracking system and verifies all required information is present. If incomplete, the request is returned to the requestor with specific details of what's missing.</li>
<li><strong>Routing:</strong> Once validated, the request is forwarded to the appropriate reviewer based on type and value.</li>
<li><strong>Review & Decision:</strong> The reviewer assesses the request against established criteria and approves or rejects within the agreed SLA (2 working days).</li>
<li><strong>Execution:</strong> Upon approval, the executor completes the required action and confirms completion in the system.</li>
<li><strong>Notification & Closure:</strong> All stakeholders are notified of the outcome. Documentation is updated and the request is marked as complete.</li>
</ol>

<h3>Exceptions</h3>
<p>If a request exceeds standard parameters, it should be escalated to the senior manager for review. Emergency requests bypass the standard queue but must be retrospectively documented.</p>`,

      improvements: [
        {
          title: 'Automate request validation',
          description: 'Implement form validation rules to catch incomplete submissions before they enter the workflow. This eliminates the back-and-forth loop of returning incomplete requests, saving approximately 30 minutes per occurrence.',
          impact: 'high', effort: 'quick', category: 'automation'
        },
        {
          title: 'Add automated reminder system',
          description: 'Set up automated reminders for reviewers approaching their SLA deadline. Currently, there\'s no prompt to act — a simple email or Slack notification at 75% of SLA would dramatically reduce late approvals.',
          impact: 'high', effort: 'quick', category: 'automation'
        },
        {
          title: 'Define clear approval criteria',
          description: 'Document and publish explicit criteria for approval/rejection decisions. Currently, decisions appear to rely on individual judgment, leading to inconsistency. A decision matrix would standardise this.',
          impact: 'medium', effort: 'medium', category: 'standardisation'
        },
        {
          title: 'Implement skill-based routing',
          description: 'Route requests to reviewers based on their expertise and current workload rather than simple round-robin. This reduces reassignment time and improves first-time resolution rates.',
          impact: 'medium', effort: 'medium', category: 'simplification'
        },
        {
          title: 'Create a real-time status dashboard',
          description: 'Build a dashboard showing all in-flight requests, their current stage, and SLA status. This provides visibility across the team and enables proactive management of bottlenecks before they cause delays.',
          impact: 'high', effort: 'strategic', category: 'automation'
        }
      ],

      gapAnalysis: {
        critical: [
          {
            question: "What happens if the reviewer is unavailable for an extended period?",
            context: "There's no escalation path or delegation mechanism if the assigned reviewer is on leave, sick, or overloaded. Requests could stall indefinitely with no visibility."
          },
          {
            question: "Who owns the process end-to-end?",
            context: "Four roles are involved but there's no single process owner accountable for overall performance, SLA adherence, or continuous improvement. Without ownership, issues get noticed but never fixed."
          },
          {
            question: "What happens after a rejection — does the process end or loop back?",
            context: "The rejection path sends reasons to the requestor, but it's unclear whether they can resubmit, appeal, or if it's a dead-end. This ambiguity could frustrate requestors and create rework."
          }
        ],
        unclear: [
          {
            question: "What are the SLA targets for each stage?",
            context: "The process mentions routing and review steps but doesn't define how long each should take. Without SLAs, there's no way to measure or manage performance."
          },
          {
            question: "How is the 'appropriate reviewer' determined?",
            context: "The coordinator routes to a reviewer, but the criteria for selection aren't defined. Is it based on request type, value, department, or availability? This could lead to inconsistent routing."
          },
          {
            question: "What constitutes 'all info provided'?",
            context: "The validation check is subjective. Different coordinators may have different standards for what's complete, leading to inconsistent outcomes and requestor frustration."
          }
        ],
        optimisation: [
          {
            question: "Could the coordinator role be eliminated with smart form design?",
            context: "If the submission form enforces mandatory fields and auto-routes based on request type, the manual logging and validation step becomes unnecessary — removing an entire role from the process."
          },
          {
            question: "Is the separate notification step needed, or could it be automated?",
            context: "Stakeholder notification after execution could be triggered automatically by the system when status changes, rather than requiring manual action by the executor."
          },
          {
            question: "Could low-risk requests skip the review step entirely?",
            context: "If clear criteria exist, some request types (e.g., standard, low-value, pre-approved categories) could be auto-approved, reducing bottlenecks and freeing reviewer capacity for complex cases."
          }
        ]
      }
    };
  }
};

// --- Boot ---
document.addEventListener('DOMContentLoaded', () => {
  // MVP: Direct OpenRouter key (move to server-side worker before scaling)
  // API calls go through secure server-side proxy — no keys in client code
  window.CLARITY_API_URL = 'https://clarity-api-kb8a.onrender.com/generate';

  ClarityApp.init();

  // If no API URL and no OR key, fall back to demo mode
  if (!window.CLARITY_API_URL && !window.CLARITY_OR_KEY) {
    ClarityApp.enableDemoMode();
    console.log('🔧 Clarity running in demo mode. Set window.CLARITY_API_URL or window.CLARITY_OR_KEY to connect to AI.');
  } else {
    console.log('✨ Clarity connected to AI backend.');
  }
});
