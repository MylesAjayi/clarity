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
    system: `You are an expert Business Analyst with 15+ years of experience in process mapping, documentation, and improvement. You work at Nova Insights & Solutions.

Your task is to take a description of a business process and produce THREE outputs in a single JSON response:

1. "flowchart" — An array of steps for a process flowchart. Each step is an object:
   { "type": "start"|"process"|"decision"|"end", "label": "Step description", "yes_label": "optional", "no_label": "optional" }
   Decisions should have yes_label and no_label for the two paths.

2. "sop" — A detailed Standard Operating Procedure in HTML format. Include:
   - Process title and purpose
   - Scope
   - Roles & responsibilities table
   - Step-by-step procedure (numbered)
   - Key decision points explained
   - Exceptions and edge cases
   Use proper HTML tags: <h3>, <p>, <ol>, <li>, <table>, <tr>, <th>, <td>

3. "improvements" — An array of improvement recommendations. Each:
   { "title": "Short title", "description": "Detailed explanation", "impact": "high"|"medium"|"low", "effort": "quick"|"medium"|"strategic", "category": "automation"|"elimination"|"simplification"|"standardisation"|"risk" }

Respond ONLY with valid JSON. No markdown, no code fences, just the JSON object with keys: flowchart, sop, improvements.`,

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
          max_tokens: 4000,
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

    if (!parsed.flowchart || !parsed.sop || !parsed.improvements) {
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

    // Render improvements
    this.renderImprovements(data.improvements);

    // Scroll to output
    document.getElementById('output-section').scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Default to flowchart tab
    this.showOutput('flowchart');
  },

  renderFlowchart(steps) {
    const container = document.getElementById('flowchart-content');
    let html = '<div style="display:flex;flex-direction:column;align-items:center;gap:0;">';

    steps.forEach((step, i) => {
      const typeClass = step.type || 'process';
      html += `
        <div class="flow-node">
          <div class="flow-box ${typeClass}">${step.label}</div>
          ${step.type === 'decision' ? `<div style="display:flex;gap:2rem;font-size:0.75rem;color:var(--grey-500);margin-top:0.3rem;"><span>✓ ${step.yes_label || 'Yes'}</span><span>✗ ${step.no_label || 'No'}</span></div>` : ''}
        </div>
      `;
      if (i < steps.length - 1) {
        html += '<div class="flow-arrow"></div>';
      }
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
    const { sop, improvements } = this.state.outputs;

    // Convert SOP HTML to rough markdown
    let md = '# Process Documentation\n\n';
    md += '## Standard Operating Procedure\n\n';
    md += sop.replace(/<h3>/g, '\n### ').replace(/<\/h3>/g, '\n')
            .replace(/<p>/g, '\n').replace(/<\/p>/g, '\n')
            .replace(/<li>/g, '- ').replace(/<\/li>/g, '\n')
            .replace(/<[^>]+>/g, '').trim();
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
      flowchart: [
        { type: 'start', label: 'Process Triggered' },
        { type: 'process', label: 'Step 1: Initial request received and logged' },
        { type: 'process', label: 'Step 2: Request details verified and validated' },
        { type: 'decision', label: 'Is all required information provided?', yes_label: 'Complete', no_label: 'Incomplete' },
        { type: 'process', label: 'Step 3: Request sent to appropriate team for review' },
        { type: 'decision', label: 'Request approved?', yes_label: 'Approved', no_label: 'Rejected' },
        { type: 'process', label: 'Step 4: Action completed and stakeholders notified' },
        { type: 'process', label: 'Step 5: Documentation updated and filed' },
        { type: 'end', label: 'Process Complete' }
      ],
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
      ]
    };
  }
};

// --- Boot ---
document.addEventListener('DOMContentLoaded', () => {
  // MVP: Direct OpenRouter key (move to server-side worker before scaling)
  // API key is loaded server-side via Cloudflare Worker — never in client code
  // window.CLARITY_OR_KEY is not used in production

  ClarityApp.init();

  // If no API URL and no OR key, fall back to demo mode
  if (!window.CLARITY_API_URL && !window.CLARITY_OR_KEY) {
    ClarityApp.enableDemoMode();
    console.log('🔧 Clarity running in demo mode. Set window.CLARITY_API_URL or window.CLARITY_OR_KEY to connect to AI.');
  } else {
    console.log('✨ Clarity connected to AI backend.');
  }
});
