export type SourceKind = "blog" | "status" | "releases" | "changelog";
export type CuratedSource = {
  id:string; vendor:string; name:string; title:string; kind:SourceKind; url:string; product?:string;
};

const MIRROR = "https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/";

export const CURATED_SOURCES:readonly CuratedSource[] = Object.freeze([
  { id:"openai-news", vendor:"openai", name:"OpenAI", title:"OpenAI News", kind:"blog", url:"https://openai.com/news/rss.xml" },
  { id:"google-ai", vendor:"google", name:"Google", title:"Google AI Blog", kind:"blog", url:"https://blog.google/innovation-and-ai/technology/ai/rss/" },
  { id:"deepmind", vendor:"google", name:"Google DeepMind", title:"Google DeepMind Blog", kind:"blog", url:"https://deepmind.google/blog/rss.xml" },
  { id:"huggingface", vendor:"huggingface", name:"Hugging Face", title:"Hugging Face Blog", kind:"blog", url:"https://huggingface.co/blog/feed.xml" },
  { id:"together", vendor:"together", name:"Together AI", title:"Together AI Blog", kind:"blog", url:"https://www.together.ai/blog/rss.xml" },
  { id:"anthropic-news", vendor:"anthropic", name:"Anthropic", title:"Anthropic News", kind:"blog", url:MIRROR + "feed_anthropic_news.xml" },
  { id:"anthropic-engineering", vendor:"anthropic", name:"Anthropic", title:"Anthropic Engineering", kind:"blog", url:MIRROR + "feed_anthropic_engineering.xml" },
  { id:"anthropic-research", vendor:"anthropic", name:"Anthropic", title:"Anthropic Research", kind:"blog", url:MIRROR + "feed_anthropic_research.xml" },
  { id:"xai-news", vendor:"xai", name:"xAI", title:"xAI News", kind:"blog", url:MIRROR + "feed_xainews.xml" },
  { id:"mistral-news", vendor:"mistral", name:"Mistral", title:"Mistral News", kind:"blog", url:MIRROR + "feed_mistral.xml" },
  { id:"meta-ai", vendor:"meta", name:"Meta", title:"Meta AI Blog", kind:"blog", url:MIRROR + "feed_meta_ai.xml" },
  { id:"cohere", vendor:"cohere", name:"Cohere", title:"Cohere Blog", kind:"blog", url:MIRROR + "feed_cohere.xml" },
  { id:"groq", vendor:"groq", name:"Groq", title:"Groq Blog", kind:"blog", url:MIRROR + "feed_groq.xml" },
  { id:"perplexity", vendor:"perplexity", name:"Perplexity", title:"Perplexity Hub", kind:"blog", url:MIRROR + "feed_perplexity_hub.xml" },
  { id:"the-batch", vendor:"deeplearning", name:"The Batch", title:"The Batch (DeepLearning.AI)", kind:"blog", url:MIRROR + "feed_the_batch.xml" },
  { id:"verge-ai", vendor:"verge", name:"The Verge", title:"The Verge AI", kind:"blog", url:"https://www.theverge.com/rss/ai-artificial-intelligence/index.xml" },
  { id:"chip-huyen", vendor:"chip-huyen", name:"Chip Huyen", title:"Chip Huyen", kind:"blog", url:"https://huyenchip.com/feed.xml" },
  { id:"lilian-weng", vendor:"lilian-weng", name:"Lilian Weng", title:"Lil'Log (Lilian Weng)", kind:"blog", url:"https://lilianweng.github.io/index.xml" },
  { id:"anthropic-status", vendor:"anthropic", name:"Anthropic", title:"Claude Status", kind:"status", url:"https://status.claude.com/history.rss" },
  { id:"openai-status", vendor:"openai", name:"OpenAI", title:"OpenAI Status", kind:"status", url:"https://status.openai.com/history.rss" },
  { id:"claude-code-releases", vendor:"anthropic", name:"Anthropic", title:"Claude Code Releases", product:"Claude Code", kind:"releases", url:"https://github.com/anthropics/claude-code/releases.atom" },
  { id:"claude-code-changelog", vendor:"anthropic", name:"Anthropic", title:"Claude Code Changelog", product:"Claude Code", kind:"changelog", url:"https://code.claude.com/docs/en/changelog/rss.xml" },
  { id:"anthropic-sdk", vendor:"anthropic", name:"Anthropic", title:"Anthropic SDK Releases", product:"Anthropic SDK", kind:"releases", url:"https://github.com/anthropics/anthropic-sdk-python/releases.atom" },
  { id:"xai-sdk", vendor:"xai", name:"xAI", title:"xAI SDK Releases", product:"xAI SDK", kind:"releases", url:"https://github.com/xai-org/xai-sdk-python/releases.atom" },
  { id:"mistral-sdk", vendor:"mistral", name:"Mistral", title:"Mistral SDK Releases", product:"Mistral SDK", kind:"releases", url:"https://github.com/mistralai/client-python/releases.atom" },
  { id:"ollama", vendor:"ollama", name:"Ollama", title:"Ollama Releases", product:"Ollama", kind:"releases", url:"https://github.com/ollama/ollama/releases.atom" },
  { id:"vllm", vendor:"vllm", name:"vLLM", title:"vLLM Releases", product:"vLLM", kind:"releases", url:"https://github.com/vllm-project/vllm/releases.atom" },
  { id:"mcp-servers", vendor:"mcp", name:"MCP", title:"MCP Servers Releases", product:"MCP Servers", kind:"releases", url:"https://github.com/modelcontextprotocol/servers/releases.atom" },
  { id:"cursor", vendor:"cursor", name:"Cursor", title:"Cursor Changelog", product:"Cursor", kind:"changelog", url:"https://cursor.com/changelog/rss.xml" },
]);
