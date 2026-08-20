# The Completely Free Strix Pentesting Manual

This guide will walk you through setting up and running **Strix**—the autonomous AI penetration testing tool—without spending a single dime, adding a credit card, or paying for API usage. 

To achieve a 100% free setup, we will leverage **local open-source AI models** (like Ollama) running on your own machine instead of expensive cloud APIs.

---

## Step 1: Install Prerequisites

Before installing Strix, you need to have Docker running on your machine, as Strix uses it to safely sandbox its exploitation environment.

1. **Install Docker:**
   - Go to the [Docker website](https://docs.docker.com/get-docker/) and download Docker Desktop for your operating system (Windows, macOS, or Linux).
   - Install it and ensure the Docker engine is running in the background.

---

## Step 2: Set Up a Free Local AI (Ollama)

Strix requires an AI model to act as its "brain." Since commercial APIs (like OpenAI or Anthropic) require a credit card, we will use **Ollama** to run a free, local AI model directly on your computer.

1. **Install Ollama:**
   - Download and install Ollama from [ollama.com](https://ollama.com).
2. **Download a Model:**
   - Open your terminal/command prompt and run the following command to download a capable free model (for example, Llama 3 or Mistral):
     ```bash
     ollama run llama3
     ```
   - *Note: Leave this terminal window open or ensure the Ollama app is running in your system tray so the local API remains active.*
3. **Verify the Local API:**
   - Ollama automatically starts a local API server, usually at `http://localhost:11434/v1`.

---

## Step 3: Install Strix

Now that your prerequisites are ready, install the Strix command-line interface (CLI).

1. Open a new terminal window.
2. Run the official Strix installation script:
   ```bash
   curl -sSL https://strix.ai/install | bash
   ```
   *(If you are on Windows, you may need to use WSL or Git Bash to run this command).*

---

## Step 4: Configure Strix for Free Local AI

You need to tell Strix to use your free local Ollama model instead of trying to reach out to paid services.

Run the following commands in your terminal to set your environment variables:

1. **Set the base URL to your local Ollama server:**
   ```bash
   export LLM_API_BASE="http://localhost:11434/v1"
   ```
2. **Set the LLM name to the model you downloaded:**
   ```bash
   export STRIX_LLM="llama3"
   ```
3. **Provide a dummy API key:**
   *(Strix expects an API key, but local Ollama doesn't require a real one. Any text will work).*
   ```bash
   export LLM_API_KEY="dummy-free-key"
   ```
4. **(Optional) Lower the reasoning effort for local models:**
   *(If your computer is running slowly, this tells Strix to do a quicker scan).*
   ```bash
   export STRIX_REASONING_EFFORT="medium"
   ```

> [!TIP]
> Strix automatically saves this configuration to `~/.strix/cli-config.json`, so you only need to do this setup once!

---

## Step 5: Run Your First Free Scan

You are now ready to unleash Strix on an application or directory. 

> [!WARNING]
> **Authorized use only.** Only run Strix against applications, directories, or codebases that you own or have explicit written permission to test.

**To scan a local code folder:**
Navigate to your project directory or specify the path:
```bash
strix --target ./your-app-directory
```

**To scan an active web app:**
```bash
strix --target https://your-test-app.com
```

*Note: The very first time you run this, Strix will download its sandbox Docker image, which might take a few minutes. Subsequent runs will be much faster.*

---

## Step 6: View the Results Locally (No Cloud Needed)

Strix processes the scan entirely on your machine and saves the results locally to a folder named `strix_runs/<run-name>`. 

To view the findings in a beautiful, private dashboard without uploading anything to the cloud:

1. Run the local viewer command:
   ```bash
   strix view
   ```
2. This will start a local server (on `127.0.0.1`) and automatically open a secure link in your web browser. 
3. In this dashboard, you can view the vulnerabilities found, see the exact proof-of-concept exploits, and generate exportable reports.

---

## Alternative: Do you already have a ChatGPT Plus Subscription?

If you already pay for **ChatGPT Plus or Pro** for your personal use, you can actually use Strix for free using your existing subscription without paying for extra API credits!

1. Sign in to your ChatGPT account through Strix:
   ```bash
   strix auth login chatgpt
   ```
2. Tell Strix to route its brain through your subscription:
   ```bash
   export STRIX_LLM="chatgpt/gpt-5.4"
   ```
3. Run your scan as normal!
