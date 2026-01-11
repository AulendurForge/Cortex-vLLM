'use client';

import Link from 'next/link';
import { Card, SectionTitle, InfoBox, Badge, Button } from '../../../../../src/components/UI';
import { cn } from '../../../../../src/lib/cn';

export default function RecipesGuide() {
  return (
    <section className="space-y-6">
      {/* Introduction */}
      <Card className="p-5 bg-gradient-to-r from-purple-500/5 via-violet-500/5 to-indigo-500/5 border-white/5">
        <div className="flex items-center gap-4">
          <div className="text-4xl">📜</div>
          <div>
            <h2 className="text-[14px] font-bold text-white mb-1">What are Recipes?</h2>
            <p className="text-[13px] text-white/80 leading-relaxed">
              Recipes are saved model configurations that you can reuse to deploy models with the same 
              settings. They're perfect for standardizing deployments, sharing configurations across 
              environments, or quickly recreating a working setup.
            </p>
          </div>
        </div>
      </Card>

      {/* Benefits */}
      <section className="space-y-3">
        <SectionTitle variant="purple" className="text-[10px]">Why Use Recipes?</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <BenefitCard 
            icon="⚡"
            title="Quick Deployment"
            description="Deploy models in seconds by applying a saved recipe instead of configuring from scratch"
          />
          <BenefitCard 
            icon="🔄"
            title="Reproducibility"
            description="Ensure consistent settings across deployments, environments, or servers"
          />
          <BenefitCard 
            icon="📤"
            title="Sharing"
            description="Export recipes as JSON to share with team members or across Cortex instances"
          />
          <BenefitCard 
            icon="🛡️"
            title="Backup"
            description="Save working configurations before making changes—easy rollback if needed"
          />
        </div>
      </section>

      {/* Creating Recipes */}
      <section className="space-y-3">
        <SectionTitle variant="cyan" className="text-[10px]">Creating a Recipe</SectionTitle>
        <Card className="p-4 bg-cyan-500/5 border-cyan-500/20 space-y-4">
          <p className="text-[12px] text-white/70 leading-relaxed">
            There are two ways to create a recipe:
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* From existing model */}
            <div className="p-4 bg-black/30 rounded-lg border border-white/10 space-y-3">
              <div className="flex items-center gap-2">
                <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 text-[10px]">Method 1</Badge>
                <span className="text-[11px] font-bold text-white">From an Existing Model</span>
              </div>
              <ol className="space-y-2 text-[11px] text-white/70">
                <li className="flex gap-2">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold">1</span>
                  <span>In the Models table, find the model you want to save</span>
                </li>
                <li className="flex gap-2">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold">2</span>
                  <span>Click the <strong className="text-purple-300">Recipe</strong> button in the Actions column</span>
                </li>
                <li className="flex gap-2">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold">3</span>
                  <span>Enter a descriptive name (e.g., "Llama 3.1 8B - 4 GPU Production")</span>
                </li>
                <li className="flex gap-2">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold">4</span>
                  <span>Click <strong className="text-cyan-300">Save Recipe</strong></span>
                </li>
              </ol>
              <p className="text-[10px] text-white/50 italic">
                The recipe captures all settings: engine, mode, GPU allocation, context length, 
                request defaults, and custom arguments.
              </p>
            </div>

            {/* From scratch */}
            <div className="p-4 bg-black/30 rounded-lg border border-white/10 space-y-3">
              <div className="flex items-center gap-2">
                <Badge className="bg-cyan-500/20 text-cyan-300 border-cyan-500/30 text-[10px]">Method 2</Badge>
                <span className="text-[11px] font-bold text-white">During Model Creation</span>
              </div>
              <ol className="space-y-2 text-[11px] text-white/70">
                <li className="flex gap-2">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold">1</span>
                  <span>Configure a new model through the Add Model wizard</span>
                </li>
                <li className="flex gap-2">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold">2</span>
                  <span>After the model is created and working, use Method 1 to save it</span>
                </li>
              </ol>
              <p className="text-[10px] text-white/50 italic">
                Tip: Always test a configuration before saving as a recipe to ensure it works correctly.
              </p>
            </div>
          </div>
        </Card>
      </section>

      {/* Using Recipes */}
      <section className="space-y-3">
        <SectionTitle variant="purple" className="text-[10px]">Using Recipes</SectionTitle>
        <Card className="p-4 bg-purple-500/5 border-purple-500/20 space-y-4">
          <p className="text-[12px] text-white/70 leading-relaxed">
            Access your saved recipes from the <strong className="text-purple-300">📜 Recipes</strong> button 
            in the Models page header.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Apply a recipe */}
            <div className="p-4 bg-black/30 rounded-lg border border-white/10 space-y-3">
              <div className="text-[11px] font-bold text-white flex items-center gap-2">
                <span className="text-emerald-400">▶️</span>
                Applying a Recipe
              </div>
              <ol className="space-y-2 text-[11px] text-white/70">
                <li className="flex gap-2">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold">1</span>
                  <span>Click <strong className="text-purple-300">📜 Recipes</strong> in the page header</span>
                </li>
                <li className="flex gap-2">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold">2</span>
                  <span>Find your recipe in the list</span>
                </li>
                <li className="flex gap-2">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold">3</span>
                  <span>Click <strong className="text-cyan-300">Apply</strong></span>
                </li>
                <li className="flex gap-2">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold">4</span>
                  <span>The Add Model wizard opens pre-filled with recipe settings</span>
                </li>
                <li className="flex gap-2">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold">5</span>
                  <span>Adjust if needed, then click <strong className="text-emerald-300">Create</strong></span>
                </li>
              </ol>
            </div>

            {/* What recipes contain */}
            <div className="p-4 bg-black/30 rounded-lg border border-white/10 space-y-3">
              <div className="text-[11px] font-bold text-white flex items-center gap-2">
                <span className="text-purple-400">📋</span>
                What Recipes Store
              </div>
              <ul className="space-y-1.5 text-[11px] text-white/70">
                <li className="flex items-start gap-2">
                  <span className="text-purple-400">•</span>
                  <span>Engine type (vLLM or llama.cpp)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-400">•</span>
                  <span>Mode (Online/Offline) and model source</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-400">•</span>
                  <span>Model name and served model name</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-400">•</span>
                  <span>Task type (generate/embed)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-400">•</span>
                  <span>GPU allocation and tensor parallelism settings</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-400">•</span>
                  <span>Engine-specific configuration (context, memory, etc.)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-400">•</span>
                  <span>Request defaults (temperature, penalties, etc.)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-400">•</span>
                  <span>Custom startup arguments and environment variables</span>
                </li>
              </ul>
            </div>
          </div>

          <InfoBox variant="blue" className="text-[10px] p-3">
            <strong>Note:</strong> When applying a recipe, you can modify any settings before creating the 
            model. The recipe serves as a starting point, not a rigid template.
          </InfoBox>
        </Card>
      </section>

      {/* Managing Recipes */}
      <section className="space-y-3">
        <SectionTitle variant="blue" className="text-[10px]">Managing Recipes</SectionTitle>
        <Card className="p-4 bg-blue-500/5 border-blue-500/20 space-y-4">
          <p className="text-[12px] text-white/70 leading-relaxed">
            The Recipes modal shows all your saved configurations with options to manage them:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <RecipeAction 
              icon="📤"
              title="Export"
              description="Download recipe as JSON for backup or sharing"
              color="cyan"
            />
            <RecipeAction 
              icon="📥"
              title="Import"
              description="Upload a JSON recipe file from another source"
              color="emerald"
            />
            <RecipeAction 
              icon="🗑️"
              title="Delete"
              description="Remove a recipe you no longer need"
              color="red"
            />
          </div>

          <div className="p-4 bg-black/30 rounded-lg border border-white/10 space-y-3">
            <div className="text-[11px] font-bold text-white">Recipe JSON Format</div>
            <p className="text-[10px] text-white/60 leading-relaxed mb-2">
              Exported recipes are JSON files containing all configuration fields. You can edit these 
              manually or use them for automation:
            </p>
            <pre className="text-[9px] text-white/60 bg-black/50 p-3 rounded overflow-x-auto">
{`{
  "name": "Llama 3.1 8B Production",
  "engine_type": "vllm",
  "mode": "online",
  "repo_id": "meta-llama/Llama-3.1-8B-Instruct",
  "served_model_name": "llama-3.1-8b",
  "task": "generate",
  "tp_size": 2,
  "selected_gpus": [0, 1],
  "max_model_len": 32768,
  "gpu_memory_utilization": 0.9,
  "dtype": "bfloat16",
  "temperature": 0.7,
  ...
}`}
            </pre>
          </div>
        </Card>
      </section>

      {/* Best Practices */}
      <section className="space-y-3">
        <SectionTitle variant="emerald" className="text-[10px]">Recipe Best Practices</SectionTitle>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-4 bg-emerald-500/5 border-emerald-500/20 space-y-3">
            <div className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider">✓ Recommended</div>
            <ul className="text-[11px] text-white/70 space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-emerald-400">✓</span>
                <span><strong>Use descriptive names</strong> — Include model name, size, and use case</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400">✓</span>
                <span><strong>Test before saving</strong> — Verify the configuration works correctly</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400">✓</span>
                <span><strong>Create environment variants</strong> — "Model-Dev", "Model-Prod" with different settings</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400">✓</span>
                <span><strong>Export regularly</strong> — Keep backups of important recipes</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400">✓</span>
                <span><strong>Version your recipes</strong> — "Llama3-v1", "Llama3-v2" when updating</span>
              </li>
            </ul>
          </Card>

          <Card className="p-4 bg-amber-500/5 border-amber-500/20 space-y-3">
            <div className="text-[10px] font-bold text-amber-300 uppercase tracking-wider">💡 Tips</div>
            <ul className="text-[11px] text-white/70 space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-amber-400">💡</span>
                <span>Recipes don't store model files—ensure files exist when applying recipes on new servers</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-400">💡</span>
                <span>GPU indices in recipes may need adjustment for different hardware configurations</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-400">💡</span>
                <span>For Online mode recipes, ensure HF token is configured if model is gated</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-400">💡</span>
                <span>Create a "baseline" recipe for each model family, then derive variants</span>
              </li>
            </ul>
          </Card>
        </div>
      </section>

      {/* Example Naming Conventions */}
      <section className="space-y-3">
        <SectionTitle variant="purple" className="text-[10px]">Naming Convention Examples</SectionTitle>
        <Card className="p-4 bg-purple-500/5 border-purple-500/20">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Good Recipe Names</div>
              <ul className="text-[11px] text-white/70 space-y-1.5 font-mono">
                <li><span className="text-emerald-300">✓</span> Llama-3.1-8B-Instruct-2GPU-32K</li>
                <li><span className="text-emerald-300">✓</span> Mistral-7B-v0.3-Production-Q8</li>
                <li><span className="text-emerald-300">✓</span> GPT-OSS-120B-4GPU-llamacpp</li>
                <li><span className="text-emerald-300">✓</span> Nomic-Embed-v1.5-HighThroughput</li>
                <li><span className="text-emerald-300">✓</span> Qwen2.5-32B-Offline-Dev</li>
              </ul>
            </div>
            <div className="space-y-2">
              <div className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Avoid These</div>
              <ul className="text-[11px] text-white/70 space-y-1.5 font-mono">
                <li><span className="text-red-300">✗</span> recipe1</li>
                <li><span className="text-red-300">✗</span> test</li>
                <li><span className="text-red-300">✗</span> model config</li>
                <li><span className="text-red-300">✗</span> new recipe (2)</li>
              </ul>
            </div>
          </div>
        </Card>
      </section>

      {/* Quick Actions */}
      <div className="flex gap-3 justify-center pt-4">
        <Link href="/models">
          <Button variant="purple" size="sm" className="text-[10px]">
            📜 Open Recipes →
          </Button>
        </Link>
      </div>

      <div className="text-[9px] text-white/20 uppercase font-black tracking-[0.3em] text-center pt-4 border-t border-white/5">
        Cortex Recipes Guide • <a href="https://www.aulendur.com" target="_blank" rel="noopener noreferrer" className="hover:text-white/40 hover:underline transition-colors">Aulendur Labs</a>
      </div>
    </section>
  );
}

// Helper Components
function BenefitCard({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <Card className="p-4 bg-white/[0.02] border-white/5 hover:border-purple-500/30 transition-all duration-300">
      <div className="text-2xl mb-2">{icon}</div>
      <div className="text-[11px] font-bold text-white uppercase tracking-wider">{title}</div>
      <div className="text-[10px] text-white/50 mt-1 leading-relaxed">{description}</div>
    </Card>
  );
}

function RecipeAction({ icon, title, description, color }: { icon: string; title: string; description: string; color: string }) {
  const colors: Record<string, string> = {
    cyan: 'bg-cyan-500/10 border-cyan-500/20',
    emerald: 'bg-emerald-500/10 border-emerald-500/20',
    red: 'bg-red-500/10 border-red-500/20',
  };
  return (
    <div className={cn("p-3 rounded-lg border", colors[color])}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">{icon}</span>
        <span className="text-[11px] font-bold text-white">{title}</span>
      </div>
      <p className="text-[10px] text-white/60">{description}</p>
    </div>
  );
}

