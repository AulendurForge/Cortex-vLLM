'use client';

import Link from 'next/link';
import { Card, SectionTitle, InfoBox, Badge, Button } from '../../../../src/components/UI';
import { cn } from '../../../../src/lib/cn';

export default function DeploymentMigration() {
  return (
    <section className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-700">
      <header className="space-y-2 text-center md:text-left">
        <h1 className="text-2xl font-black tracking-tight text-white uppercase italic">Deployment & Migration</h1>
        <p className="text-white/60 text-sm leading-relaxed max-w-3xl">
          Comprehensive guide for exporting, transferring, and importing Cortex configurations, 
          models, and databases across environments—including offline and air-gapped deployments.
        </p>
      </header>

      {/* Quick Navigation */}
      <div className="flex flex-wrap gap-2">
        <Badge className="bg-indigo-500/10 text-indigo-300 border-indigo-500/20">Full Export</Badge>
        <Badge className="bg-purple-500/10 text-purple-300 border-purple-500/20">Model Export</Badge>
        <Badge className="bg-cyan-500/10 text-cyan-300 border-cyan-500/20">Import Models</Badge>
        <Badge className="bg-blue-500/10 text-blue-300 border-blue-500/20">Database Restore</Badge>
      </div>

      {/* Overview Section */}
      <Card className="p-5 bg-white/[0.02] border-white/5 space-y-4">
        <SectionTitle variant="purple" className="text-[10px]">Overview</SectionTitle>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-3">
            <p className="text-[12px] text-white/70 leading-relaxed">
              The <strong className="text-white">Deployment</strong> page allows you to create portable migration packages 
              containing everything needed to replicate this Cortex instance on another machine—even in completely 
              offline (air-gapped) environments.
            </p>
            <InfoBox variant="blue" className="text-[11px] p-3">
              <strong>When to use:</strong> Moving from staging → production, disaster recovery, 
              deploying to classified networks, or backing up your entire configuration.
            </InfoBox>
          </div>
          <div className="space-y-2">
            <div className="text-[10px] uppercase font-bold text-white/50 tracking-wider">Package Contents</div>
            <div className="grid grid-cols-2 gap-2">
              <PackageItem icon="🐳" label="Docker Images" desc="Engine containers" />
              <PackageItem icon="🗄️" label="Database Dump" desc="Full pg_dump" />
              <PackageItem icon="📋" label="Model Manifests" desc="Configurations" />
              <PackageItem icon="🔐" label="Checksums" desc="SHA256 verification" />
            </div>
          </div>
        </div>
      </Card>

      {/* Workflow Diagram */}
      <Card className="p-4 bg-gradient-to-r from-indigo-500/5 via-purple-500/5 to-cyan-500/5 border-white/5">
        <div className="text-[10px] uppercase font-bold text-white/50 tracking-wider mb-3">Migration Workflow</div>
        <div className="flex flex-wrap items-center justify-center gap-2 text-[11px]">
          <WorkflowStep num={1} label="Export" color="indigo" />
          <Arrow />
          <WorkflowStep num={2} label="Transfer" color="purple" />
          <Arrow />
          <WorkflowStep num={3} label="Load Images" color="cyan" />
          <Arrow />
          <WorkflowStep num={4} label="Import" color="blue" />
          <Arrow />
          <WorkflowStep num={5} label="Verify" color="emerald" />
        </div>
      </Card>

      {/* Full Deployment Export */}
      <section className="space-y-3">
        <SectionTitle variant="purple" className="text-[10px]">1. Full Deployment Export</SectionTitle>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="p-4 bg-white/[0.02] border-white/5 lg:col-span-2 space-y-4">
            <p className="text-[12px] text-white/70 leading-relaxed">
              A full export creates a complete migration package including Docker images, database dump, 
              and model configurations. This is ideal for migrating your entire Cortex deployment.
            </p>
            
            <div className="space-y-2">
              <div className="text-[10px] uppercase font-bold text-white/50 tracking-wider">Steps</div>
              <ol className="space-y-2 text-[11px] text-white/80">
                <StepItem num={1}>
                  Navigate to <strong>Admin → Deployment</strong>
                </StepItem>
                <StepItem num={2}>
                  Set the <strong>Output Directory</strong> (e.g., <code className="bg-white/10 px-1 py-0.5 rounded">/var/cortex/exports</code>)
                </StepItem>
                <StepItem num={3}>
                  Select export options:
                  <ul className="mt-1 ml-4 space-y-1 text-white/60">
                    <li>✓ <strong>Export Docker images</strong> — Required for offline deployment</li>
                    <li>✓ <strong>Export database dump</strong> — Preserves all models, users, keys</li>
                    <li>✓ <strong>Export config + manifests</strong> — Model configurations</li>
                    <li>○ Archive models directory — Only if models stored locally (large!)</li>
                  </ul>
                </StepItem>
                <StepItem num={4}>
                  Click <strong>"Check Size"</strong> to estimate space requirements
                </StepItem>
                <StepItem num={5}>
                  Click <strong>"Start Full Export"</strong> and monitor progress
                </StepItem>
              </ol>
            </div>

            <InfoBox variant="cyan" className="text-[11px] p-3">
              <strong>💡 Tip:</strong> For large deployments, use "Check Size" first to verify you have 
              enough disk space. The export includes a 20% safety margin in the estimate.
            </InfoBox>
          </Card>

          <Card className="p-4 bg-amber-500/5 border-amber-500/20 space-y-3">
            <div className="text-[10px] uppercase font-bold text-amber-300 tracking-wider">Export Options Guide</div>
            <div className="space-y-3">
              <OptionExplainer 
                label="Docker Images" 
                recommended={true}
                desc="vLLM and llama.cpp engine containers (~12-15 GB). Required if target has no internet."
              />
              <OptionExplainer 
                label="Database Dump" 
                recommended={true}
                desc="Complete PostgreSQL backup. Includes models, users, API keys, usage data."
              />
              <OptionExplainer 
                label="Archive Models" 
                recommended={false}
                desc="Only needed for local model files. Can be 50-200+ GB depending on models."
              />
              <OptionExplainer 
                label="Archive HF Cache" 
                recommended={false}
                desc="HuggingFace download cache. Usually not needed—models download from repo_id."
              />
            </div>
          </Card>
        </div>
      </section>

      {/* Single Model Export */}
      <section className="space-y-3">
        <SectionTitle variant="cyan" className="text-[10px]">2. Single Model Export</SectionTitle>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-4 bg-white/[0.02] border-white/5 space-y-4">
            <p className="text-[12px] text-white/70 leading-relaxed">
              Export a single model with its engine image. Useful when you want to move just one model 
              to another Cortex instance without the full database.
            </p>
            
            <div className="space-y-2">
              <div className="text-[10px] uppercase font-bold text-white/50 tracking-wider">Steps</div>
              <ol className="space-y-2 text-[11px] text-white/80">
                <StepItem num={1}>
                  In the <strong>"Export a single model"</strong> section, select a model from the dropdown
                </StepItem>
                <StepItem num={2}>
                  Optionally check <strong>"Archive this model's files directory"</strong> for offline models
                </StepItem>
                <StepItem num={3}>
                  Click <strong>"Export Model"</strong>
                </StepItem>
              </ol>
            </div>

            <div className="p-3 bg-white/5 rounded-xl border border-white/10">
              <div className="text-[10px] uppercase font-bold text-white/50 mb-2">Output Files</div>
              <code className="text-[10px] text-cyan-300 block">
                /var/cortex/exports/manifests/model-{'{id}'}.json<br/>
                /var/cortex/exports/images/cortex-model-{'{id}'}-*.tar
              </code>
            </div>
          </Card>

          <Card className="p-4 bg-white/[0.02] border-white/5 space-y-3">
            <div className="text-[10px] uppercase font-bold text-white/50 tracking-wider">What Gets Exported</div>
            <div className="space-y-2 text-[11px] text-white/70">
              <div className="flex items-start gap-2">
                <span className="text-emerald-400">✓</span>
                <div>
                  <strong className="text-white">Model Configuration</strong>
                  <div className="text-white/50">Engine type, parameters, served_model_name, context length, etc.</div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-emerald-400">✓</span>
                <div>
                  <strong className="text-white">Engine Image</strong>
                  <div className="text-white/50">Tagged with unique export ID to avoid conflicts</div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-amber-400">⚠</span>
                <div>
                  <strong className="text-white">HF Token (Redacted)</strong>
                  <div className="text-white/50">Security: tokens are removed. Re-add after import if needed.</div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </section>

      {/* Import Models */}
      <section className="space-y-3">
        <SectionTitle variant="blue" className="text-[10px]">3. Import Models (Target System)</SectionTitle>
        <Card className="p-4 bg-white/[0.02] border-white/5 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-4">
              <p className="text-[12px] text-white/70 leading-relaxed">
                After transferring the export package to your target system, import models using the 
                <strong> "Import model from manifest"</strong> section.
              </p>
              
              <div className="space-y-2">
                <div className="text-[10px] uppercase font-bold text-white/50 tracking-wider">Steps</div>
                <ol className="space-y-2 text-[11px] text-white/80">
                  <StepItem num={1}>
                    <strong>First:</strong> Load Docker images on target system:
                    <code className="block mt-1 p-2 bg-black/30 rounded text-[10px] text-cyan-300">
                      docker load -i /var/cortex/exports/images/*.tar
                    </code>
                  </StepItem>
                  <StepItem num={2}>
                    Set <strong>Import directory</strong> to your export location
                  </StepItem>
                  <StepItem num={3}>
                    Click <strong>"Scan"</strong> to find available manifests
                  </StepItem>
                  <StepItem num={4}>
                    Select a manifest from the dropdown
                  </StepItem>
                  <StepItem num={5}>
                    Click <strong>"Preview"</strong> to validate before importing
                  </StepItem>
                  <StepItem num={6}>
                    Review warnings/conflicts, then click <strong>"Import"</strong>
                  </StepItem>
                </ol>
              </div>
            </div>

            <div className="space-y-4">
              <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl">
                <div className="text-[10px] uppercase font-bold text-purple-300 mb-2">Conflict Handling</div>
                <div className="space-y-2 text-[11px] text-white/70">
                  <div>
                    <strong className="text-white">Auto-rename:</strong> If a model with the same served_model_name exists, 
                    the import adds "-IMPORTED" suffix.
                  </div>
                  <div>
                    <strong className="text-white">Error mode:</strong> Import fails if name conflict detected.
                  </div>
                </div>
              </div>

              <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                <div className="text-[10px] uppercase font-bold text-blue-300 mb-2">Preview Checks</div>
                <ul className="space-y-1 text-[11px] text-white/70">
                  <li>✓ Engine image exists in Docker</li>
                  <li>✓ local_path directory exists (if offline model)</li>
                  <li>✓ No served_model_name conflicts</li>
                  <li>⚠ HF token warning if previously configured</li>
                </ul>
              </div>
            </div>
          </div>
        </Card>
      </section>

      {/* Database Restore */}
      <section className="space-y-3">
        <SectionTitle variant="purple" className="text-[10px]">4. Database Restore</SectionTitle>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-4 bg-red-500/5 border-red-500/20 space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-red-400 text-lg">⚠️</span>
              <div className="text-[11px] font-bold text-red-200 uppercase tracking-wider">Destructive Operation</div>
            </div>
            <p className="text-[12px] text-white/70 leading-relaxed">
              Database restore <strong>replaces</strong> existing data. This operation should be used carefully 
              and typically only during initial deployment or disaster recovery.
            </p>
            
            <div className="space-y-2">
              <div className="text-[10px] uppercase font-bold text-white/50 tracking-wider">Safety Options</div>
              <div className="space-y-2 text-[11px] text-white/70">
                <div className="flex items-start gap-2">
                  <input type="checkbox" checked readOnly className="mt-0.5" />
                  <div>
                    <strong className="text-emerald-300">Create backup before restore</strong>
                    <div className="text-white/50">Saves current DB to pre_restore_backup/ folder</div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <input type="checkbox" readOnly className="mt-0.5" />
                  <div>
                    <strong className="text-amber-300">Drop existing tables first</strong>
                    <div className="text-white/50">Clean restore—removes all current data</div>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-4 bg-white/[0.02] border-white/5 space-y-4">
            <div className="space-y-2">
              <div className="text-[10px] uppercase font-bold text-white/50 tracking-wider">Steps</div>
              <ol className="space-y-2 text-[11px] text-white/80">
                <StepItem num={1}>
                  Set <strong>Import directory</strong> containing the export
                </StepItem>
                <StepItem num={2}>
                  Click <strong>"Check Dump"</strong> to verify db/cortex.sql exists
                </StepItem>
                <StepItem num={3}>
                  Enable <strong>"Create backup before restore"</strong> (recommended)
                </StepItem>
                <StepItem num={4}>
                  For clean import, enable <strong>"Drop existing tables first"</strong>
                </StepItem>
                <StepItem num={5}>
                  Click <strong>"Restore Database"</strong> and confirm
                </StepItem>
              </ol>
            </div>

            <InfoBox variant="cyan" className="text-[11px] p-3">
              <strong>After restore:</strong> All models will be in "stopped" state. Start them individually 
              to verify each one works correctly on the new system.
            </InfoBox>
          </Card>
        </div>
      </section>

      {/* Transfer Methods */}
      <section className="space-y-3">
        <SectionTitle variant="cyan" className="text-[10px]">5. Transfer Methods</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card className="p-4 bg-white/[0.02] border-white/5 space-y-2">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">💾</span>
              <div className="text-[11px] font-bold text-white uppercase">USB / External Drive</div>
            </div>
            <p className="text-[11px] text-white/60 leading-relaxed">
              Most common for air-gapped environments. Copy the entire export directory to portable media.
            </p>
            <code className="text-[10px] text-cyan-300 block p-2 bg-black/30 rounded">
              cp -r /var/cortex/exports /media/usb/
            </code>
          </Card>

          <Card className="p-4 bg-white/[0.02] border-white/5 space-y-2">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">🔒</span>
              <div className="text-[11px] font-bold text-white uppercase">SCP / SFTP</div>
            </div>
            <p className="text-[11px] text-white/60 leading-relaxed">
              Secure transfer over network. Use rsync for resume capability on large files.
            </p>
            <code className="text-[10px] text-cyan-300 block p-2 bg-black/30 rounded">
              rsync -avP exports/ user@target:/var/cortex/
            </code>
          </Card>

          <Card className="p-4 bg-white/[0.02] border-white/5 space-y-2">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">📀</span>
              <div className="text-[11px] font-bold text-white uppercase">Physical Media</div>
            </div>
            <p className="text-[11px] text-white/60 leading-relaxed">
              For maximum security: burn to optical media or use network-isolated transfer appliances.
            </p>
            <div className="text-[10px] text-white/40">
              Verify checksums after transfer!
            </div>
          </Card>
        </div>
      </section>

      {/* Best Practices */}
      <section className="space-y-3">
        <SectionTitle variant="blue" className="text-[10px]">6. Best Practices</SectionTitle>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-4 bg-emerald-500/5 border-emerald-500/20 space-y-3">
            <div className="text-[10px] uppercase font-bold text-emerald-300 tracking-wider">✓ Do</div>
            <ul className="space-y-2 text-[11px] text-white/70">
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 mt-0.5">✓</span>
                <span>Always use <strong>"Check Size"</strong> before large exports</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 mt-0.5">✓</span>
                <span>Enable <strong>"Create backup before restore"</strong> on database operations</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 mt-0.5">✓</span>
                <span>Verify checksums after transferring files</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 mt-0.5">✓</span>
                <span>Use <strong>"Preview"</strong> before importing models</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 mt-0.5">✓</span>
                <span>Stop all models before database restore</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 mt-0.5">✓</span>
                <span>Document what was exported and when (audit trail)</span>
              </li>
            </ul>
          </Card>

          <Card className="p-4 bg-red-500/5 border-red-500/20 space-y-3">
            <div className="text-[10px] uppercase font-bold text-red-300 tracking-wider">✗ Avoid</div>
            <ul className="space-y-2 text-[11px] text-white/70">
              <li className="flex items-start gap-2">
                <span className="text-red-400 mt-0.5">✗</span>
                <span>Don't skip the preview step—validation catches issues early</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-400 mt-0.5">✗</span>
                <span>Don't restore database without backup on production systems</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-400 mt-0.5">✗</span>
                <span>Don't export with running models—stop them first</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-400 mt-0.5">✗</span>
                <span>Don't forget to re-configure HF tokens after import</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-400 mt-0.5">✗</span>
                <span>Don't ignore checksum warnings—corrupted files cause failures</span>
              </li>
            </ul>
          </Card>
        </div>
      </section>

      {/* Troubleshooting */}
      <section className="space-y-3">
        <SectionTitle variant="purple" className="text-[10px]">7. Troubleshooting</SectionTitle>
        <div className="space-y-3">
          <TroubleshootItem 
            issue="Export fails with 'insufficient disk space'"
            solution="Use 'Check Size' to see space requirements. Clear old exports or expand storage. The export requires space for Docker images (12-15 GB) plus database and manifests."
          />
          <TroubleshootItem 
            issue="Import preview shows 'engine image not found'"
            solution="Load the exported Docker images first: docker load -i /path/to/images/*.tar. Then re-run the preview."
          />
          <TroubleshootItem 
            issue="Database restore fails with 'relation already exists'"
            solution="Enable 'Drop existing tables first' for a clean restore. This removes all current data before importing."
          />
          <TroubleshootItem 
            issue="Model won't start after import"
            solution="Check if local_path exists and contains model files. For HF models, verify the repo_id is accessible and re-add HF token if needed."
          />
          <TroubleshootItem 
            issue="Checksum verification fails"
            solution="The file was corrupted during transfer. Re-copy from source and verify again. Don't skip verification for production deployments."
          />
        </div>
      </section>

      {/* Quick Reference */}
      <Card className="p-4 bg-gradient-to-r from-indigo-500/5 via-purple-500/5 to-cyan-500/5 border-white/5">
        <div className="text-[10px] uppercase font-bold text-white/50 tracking-wider mb-3">Quick Reference</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-[11px]">
          <div>
            <div className="text-white/80 font-semibold mb-1">Default Paths</div>
            <code className="text-cyan-300 text-[10px]">
              Export: /var/cortex/exports<br/>
              Models: /var/cortex/models<br/>
              DB dump: /var/cortex/exports/db/cortex.sql
            </code>
          </div>
          <div>
            <div className="text-white/80 font-semibold mb-1">Typical Export Sizes</div>
            <div className="text-white/60 text-[10px]">
              Docker images: 12-18 GB<br/>
              Database: 1-50 MB<br/>
              Manifests: &lt;1 MB
            </div>
          </div>
          <div>
            <div className="text-white/80 font-semibold mb-1">Go to Deployment</div>
            <Link href="/deployment">
              <Button variant="cyan" size="sm" className="mt-1 text-[10px]">
                Open Deployment Page →
              </Button>
            </Link>
          </div>
        </div>
      </Card>

      <div className="text-[9px] text-white/20 uppercase font-black tracking-[0.3em] text-center pt-4 border-t border-white/5">
        Cortex Deployment Guide • <a href="https://www.aulendur.com" target="_blank" rel="noopener noreferrer" className="hover:text-white/40 hover:underline transition-colors">Aulendur Labs</a>
      </div>
    </section>
  );
}

// Helper Components
function PackageItem({ icon, label, desc }: { icon: string; label: string; desc: string }) {
  return (
    <div className="flex items-center gap-2 p-2 bg-white/5 rounded-lg border border-white/5">
      <span className="text-lg">{icon}</span>
      <div>
        <div className="text-[10px] font-bold text-white">{label}</div>
        <div className="text-[9px] text-white/50">{desc}</div>
      </div>
    </div>
  );
}

function WorkflowStep({ num, label, color }: { num: number; label: string; color: string }) {
  const colors: Record<string, string> = {
    indigo: 'bg-indigo-500/20 border-indigo-500/30 text-indigo-300',
    purple: 'bg-purple-500/20 border-purple-500/30 text-purple-300',
    cyan: 'bg-cyan-500/20 border-cyan-500/30 text-cyan-300',
    blue: 'bg-blue-500/20 border-blue-500/30 text-blue-300',
    emerald: 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300',
  };
  return (
    <div className={cn("px-3 py-1.5 rounded-lg border font-bold", colors[color])}>
      <span className="opacity-60">{num}.</span> {label}
    </div>
  );
}

function Arrow() {
  return <span className="text-white/30">→</span>;
}

function StepItem({ num, children }: { num: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="shrink-0 w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold text-white/70">
        {num}
      </span>
      <div className="flex-1">{children}</div>
    </li>
  );
}

function OptionExplainer({ label, recommended, desc }: { label: string; recommended: boolean; desc: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className={cn("text-[10px] font-bold", recommended ? "text-emerald-300" : "text-white/60")}>
          {label}
        </span>
        {recommended && (
          <Badge className="bg-emerald-500/10 text-emerald-300 border-emerald-500/20 text-[8px]">
            Recommended
          </Badge>
        )}
      </div>
      <div className="text-[10px] text-white/50 leading-relaxed">{desc}</div>
    </div>
  );
}

function TroubleshootItem({ issue, solution }: { issue: string; solution: string }) {
  return (
    <Card className="p-3 bg-white/[0.02] border-white/5">
      <div className="flex items-start gap-3">
        <span className="text-amber-400 text-sm mt-0.5">?</span>
        <div className="space-y-1">
          <div className="text-[11px] font-bold text-white">{issue}</div>
          <div className="text-[11px] text-white/60 leading-relaxed">{solution}</div>
        </div>
      </div>
    </Card>
  );
}

