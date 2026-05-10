# Executive Summary

Unsloth provides a powerful and efficient open-source framework for fine-tuning large language models, with specific and robust support for the Gemma 4 family. Its key advantages lie in significant performance optimizations, enabling training that is approximately twice as fast while using up to 70% less VRAM compared to standard methods like Flash Attention 2. This is achieved through its open-source library and the accompanying Unsloth Studio, a no-code UI that runs 100% offline on local machines (Mac/Windows/Linux), ensuring data privacy. The platform supports various fine-tuning techniques, including LoRA and QLoRA, and simplifies data preparation with its 'Data Recipes' feature. For the proposed Next.js offline clinical demo, Unsloth is highly suitable. It allows for the fine-tuning of Gemma 4 models on private, curated datasets and can export the resulting models into formats like GGUF. These GGUF models can be run locally via llama.cpp, enabling a fully offline and private user experience, which is critical for a clinical application.

# Unsloth Capabilities Overview

Unsloth offers a comprehensive suite of tools for both inferencing and training large language models, centered around its open-source library and the Unsloth Studio UI. Its capabilities include:

*   **Inference and Execution**: Unsloth can run a wide variety of models, including those in GGUF and safetensors formats. The Unsloth Studio provides a rich environment for inference that includes tool-calling with auto-healing, web search capabilities, a built-in OpenAI-compatible API for easy integration, code execution, and a 'Model Arena' for side-by-side model comparison. It also supports automatic parameter tuning and editing of chat templates.

*   **Training Optimizations**: The core value proposition of Unsloth is its performance. It enables training that is approximately 2 times faster and uses about 70% less VRAM compared to baseline implementations, without sacrificing accuracy. This is achieved through proprietary optimizations, including a custom gradient checkpointing algorithm. These benefits apply to over 500 supported models, including text, vision, audio, and embedding models.

*   **Fine-Tuning and Reinforcement Learning (RL)**: The platform supports numerous fine-tuning techniques, most notably LoRA (16-bit) and QLoRA (4-bit), but also FP8, and full fine-tuning (available in the Enterprise tier). It also has capabilities for Reinforcement Learning, specifically supporting GRPO (Ghost-Reward-Policy-Optimization) and GSPO (Ghost-Scholar-Policy-Optimization). The training UI provides live observability with real-time loss and GPU metrics.

*   **Data Processing with 'Data Recipes'**: A standout feature is 'Data Recipes,' a visual, node-based workflow for creating and processing datasets. It allows users to upload documents like PDFs, CSVs, and DOCX files and transform them into structured datasets suitable for training. This feature, which uses NVIDIA NeMo Data Designer, allows for previewing, validation, and the creation of a local dataset artifact.

*   **Unsloth Studio**: This is a no-code, open-source UI that runs 100% offline on Mac, Windows, and Linux, ensuring data remains local and private. While it is designed for local use, a pre-configured template is also available on Vast.ai for users who prefer to rent cloud GPUs.

*   **Export and Deployment**: Models fine-tuned with Unsloth can be exported in several formats for broad compatibility. Options include a merged 16-bit safetensors model, LoRA-only adapters, or a GGUF model for use with popular inference engines like llama.cpp, Ollama, LM Studio, and vLLM. Users can save these exports locally or push them directly to the Hugging Face Hub.

# Pricing And Licensing

## Free Tier Summary

The Free tier, also referred to as 'Freeware' or the open-source version, provides access to Unsloth's core optimization engine for single-GPU setups. It supports popular open-source models including the Mistral, Gemma, and Llama (1, 2, and 3) families. Users can perform both 4-bit (QLoRA) and 16-bit (LoRA) fine-tuning, benefiting from the platform's signature performance gains of approximately 2x faster training speeds and around 60-70% reduction in VRAM usage compared to standard Hugging Face implementations.

## Pro Tier Summary

The Unsloth Pro tier is a commercial offering aimed at professional users and teams requiring enhanced multi-GPU performance. It offers improved scaling, advertising up to 2.5x the speed of Flash Attention 2 across multiple GPUs, and provides a further 20% VRAM reduction compared to the free open-source version. This tier includes enhanced support for multi-GPU training on up to 8 GPUs within a single node and is available for any use case. Pricing is available upon contacting Unsloth.

## Enterprise Tier Summary

The Unsloth Enterprise tier is the highest-level offering, designed for large-scale commercial deployment and demanding training requirements. It boasts the most significant performance enhancements, including up to 32x faster training on multiple GPUs compared to Flash Attention 2, up to a 30% potential increase in model accuracy, and 5x faster inference speeds. This tier uniquely supports full model training (beyond LoRA), multi-node scaling for massive training jobs, and includes dedicated enterprise support. Pricing is available upon contacting Unsloth.

## License Type

Community License


# Unsloth Studio Vs Open Source

## Studio Description

Unsloth Studio is an open-source, no-code web UI designed to run 100% offline. It allows users to run, train, and manage AI models, including GGUF and safetensors formats, without writing code. It also has a pre-configured template available for cloud GPUs on Vast.ai.

## Studio Platforms

Unsloth Studio is a cross-platform application that runs on Mac, Windows, and Linux operating systems.

## Studio Key Features

Key features include a visual, no-code training interface with real-time observability of metrics like loss and GPU usage. It includes 'Data Recipes', a visual node-based tool for creating datasets from files like PDF, CSV, and JSON. Other capabilities are tool-calling with auto-healing, web search, an OpenAI-compatible API, code execution, a 'Model Arena' for side-by-side model comparison, and the ability to export models in various formats.

## Open Source Description

The open-source Unsloth library provides the core engine for performance optimization. It consists of optimized kernels that enable significantly faster model training (approximately 2x faster) and reduced VRAM usage (around 60-70% less) compared to baseline setups like Flash Attention 2, without sacrificing accuracy. This is available as a 'Freeware' tier.

## Open Source Use Case

The open-source library is intended for developers and researchers who prefer a code-first approach. It is typically used in scripted environments such as Google Colab, Kaggle notebooks, or local development setups for fine-tuning models like Mistral, Gemma, and Llama with 4-bit (QLoRA) or 16-bit (LoRA) precision on a single GPU.


# Gemma 4 Support Details

## Supported Variants

Unsloth supports the Google DeepMind Gemma 4 family of open models, specifically including the E2B, E4B, 26B-A4B (MoE), and 31B variants.

## Supported Modalities

Fine-tuning for Gemma 4 models with Unsloth supports multiple modalities. The E2B and E4B variants support text, image, and audio inputs, while the 26B-A4B and 31B variants support image and text.

## Performance Gains

Unsloth claims significant performance improvements for training Gemma 4 models, stating that its optimizations make training approximately 1.5 times faster while using about 60% less VRAM compared to standard Flash Attention 2 (FA2) setups.

## Key Bug Fixes

Unsloth has implemented crucial bug fixes for universal training issues affecting Gemma 4. Notably, it has resolved problems with gradient accumulation, ensuring that using a smaller batch size with more accumulation steps is now mathematically equivalent to using a larger batch size, which was not the case in baseline implementations.


# Qlora And Lora Workflows

Unsloth provides optimized workflows for both LoRA (16-bit) and QLoRA (4-bit) fine-tuning, designed to maximize speed and minimize VRAM usage.

**Comparison of LoRA and QLoRA:**
*   **LoRA (16-bit):** This method is noted to be slightly faster and potentially more accurate than QLoRA. However, its primary drawback is its memory consumption, using approximately four times the VRAM of QLoRA.
*   **QLoRA (4-bit):** This is the more memory-efficient option, using four times less VRAM than 16-bit LoRA. This significant memory saving comes with what is described as a minor trade-off in accuracy, making it an excellent choice for hardware with limited VRAM.

**Recommended Hyperparameters and Configuration:**
*   **Target Modules:** For the best accuracy, Unsloth documentation recommends targeting all attention and MLP layers. The specific modules to include in the `target_modules` list are: `"q_proj"`, `"k_proj"`, `"v_proj"`, `"o_proj"`, `"gate_proj"`, `"up_proj"`, and `"down_proj"`.
*   **Rank and Alpha:** A common practice is to set the LoRA rank (`r`) and `lora_alpha` to similar values, with a suggested starting point being `r=8` and `alpha=8`. `RSLora` is mentioned as an optional technique.
*   **Regularization:** To prevent overfitting, it is advised to use `dropout` (e.g., `dropout=0.1`) and `weight_decay`.
*   **Learning Rate:** A learning rate in the range of `1e-4` to `2e-4` is suggested as a starting point for training.

**Unsloth-Specific Optimizations:**
*   **Gradient Accumulation:** Unsloth has implemented bug fixes that ensure using a smaller `per_device_batch_size` with a higher `gradient_accumulation_steps` is mathematically equivalent to using a larger effective batch size. This allows training with large batch sizes on low-VRAM GPUs without compromising the training dynamics. It is recommended to keep gradient checkpointing enabled when using this feature.
*   **Gradient Checkpointing:** Unsloth provides a custom, more memory-efficient gradient checkpointing implementation. To use it, you should set `gradient_checkpointing="unsloth"` in the training arguments. This is particularly effective for models with long context lengths.
*   **Bias Tuning:** The documentation mentions a `bias="unsloth"` option, which can further reduce memory usage during training.

**Verification:**
*   When validating that LoRA weights have been updated during training, it is recommended to use checksums or calculate absolute differences rather than relying on `np.allclose`, which may not be reliable for this purpose.

# Supported Dataset Formats

Unsloth supports a variety of dataset formats, from standard conversational JSONL files to custom datasets created from raw documents using its 'Data Recipes' feature.

**Conversational and Instruction Formats:**
Unsloth is compatible with several popular text-based fine-tuning formats. It can natively handle datasets structured in the following ways:
*   **ShareGPT/Vicuna:** A common format using a JSONL file where each line is a JSON object containing a list of conversations, with `from` and `value` keys indicating the speaker (`human`, `gpt`) and their message.
*   **Alpaca:** An instruction-based format, typically a JSON file containing a list of objects with `instruction`, `input`, and `output` fields.
*   **ChatML:** A format designed by OpenAI that uses specific roles like `system`, `user`, and `assistant` to structure conversations.

Unsloth provides utility functions like `get_chat_template` and `standardize_data_formats` to help process and align these different formats for training.

**Multimodal Dataset Formatting (for Gemma-4):**
For multimodal models that accept both text and images, such as Gemma-4, a specific JSON structure is required. The data should be formatted as a `messages` array containing a `content` array. Within the `content` array, the image should always be placed before the text instruction.

**Data Recipes for Custom Dataset Creation:**
Unsloth Studio includes a powerful feature called 'Data Recipes', which enables the creation of training datasets from unstructured or semi-structured documents. This feature, which uses NVIDIA NeMo Data Designer, provides a visual, node-based graph editor.
*   **Process:** Users can upload documents such as PDFs, CSVs, DOCX, and JSON files.
*   **Workflow:** In the visual editor, users can build a pipeline to process, clean, and transform the raw data into a structured, trainable format (e.g., question-answer pairs).
*   **Validation:** The interface allows for previewing and validating sample rows before running a full dataset build.
*   **Output:** Once the recipe is executed, it produces a local dataset artifact that can be immediately used for fine-tuning within Studio.
*   **Portability:** These recipes can be exported, imported, and even published to the Hugging Face Hub for sharing.

**Best Practices:**
When creating datasets, especially for models like Gemma-4 that may exhibit a 'chain-of-thought' or 'thinking' process, it is important to be consistent. You must decide whether to include the intermediate 'thoughts' in the training data or only the final answer, and then apply this format consistently across the entire dataset.

# Hardware Requirements

## Gemma 4 E2B Training Vram

Fine-tuning the Gemma 4 E2B model using LoRA with Unsloth is accessible on consumer-grade hardware, requiring between 8 to 10 GB of VRAM.

## Gemma 4 31B Qlora Training Vram

To fine-tune the larger Gemma 4 31B model using Unsloth's QLoRA implementation, a GPU with approximately 22 GB of VRAM is required.

## Inference Ram Summary E2B

For running inference on a 4-bit quantized GGUF version of the Gemma 4 E2B model, the recommended combined RAM and VRAM is approximately 4 to 5 GB.

## Inference Ram Summary 31B

Running inference on a 4-bit quantized GGUF of the Gemma 4 31B model requires a system with a recommended combined RAM and VRAM in the range of 17 to 20 GB.


# Training Scripts And Process

Initiating and managing a training process with Unsloth involves using its specialized `FastModel` classes to optimize a base model, preparing a dataset, and then using the Hugging Face TRL (Transformer Reinforcement Learning) library's `SFTTrainer` to conduct the fine-tuning. The process is designed to be efficient and requires minimal code changes from a standard Hugging Face workflow.

Here is a guide to the typical training process based on Unsloth's documentation:

**1. Model and Tokenizer Setup:**
*   First, load a pre-trained model and its corresponding tokenizer from Hugging Face.
*   The core of the Unsloth optimization happens when you pass the loaded model to `FastModel.from_pretrained()`. This function patches the model with Unsloth's custom, high-performance kernels and prepares it for PEFT (Parameter-Efficient Fine-Tuning).
*   An example snippet for a text model would look like this:
    ```python
    from unsloth import FastLanguageModel
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name = "unsloth/gemma-4-e2b-it-bnb-4bit",
        max_seq_length = max_seq_length,
        dtype = dtype,
        load_in_4bit = load_in_4bit,
    )
    ```
*   For vision models, you would use `FastVisionModel` instead.

**2. PEFT Configuration (LoRA/QLoRA):**
*   The model is then configured for LoRA fine-tuning. This involves specifying parameters like `r` (rank), `lora_alpha`, `target_modules`, and `lora_dropout`.
*   Unsloth's `FastModel` automatically prepares the model for PEFT, so you can directly apply a `LoraConfig`.
    ```python
    model = FastLanguageModel.get_peft_model(
        model,
        r = 16,
        target_modules = ["q_proj", "k_proj", "v_proj", "o_proj",
                          "gate_proj", "up_proj", "down_proj"],
        lora_alpha = 16,
        lora_dropout = 0,
        bias = "none",
        use_gradient_checkpointing = "unsloth",
        random_state = 3407,
        use_rslora = False,
        loftq_config = None,
    )
    ```

**3. Dataset Preparation and Formatting:**
*   Load your dataset, which can be in formats like ShareGPT, Alpaca, or a custom format.
*   Apply the model's chat template to format the raw text into a conversational structure that the model expects. Unsloth provides helpers for this, as seen in its guides.
*   The documentation mentions using functions like `standardize_data_formats` to ensure the dataset is correctly structured.

**4. Trainer Initialization:**
*   The training process is managed by the `SFTTrainer` from the TRL library.
*   You initialize the trainer with the Unsloth-patched model, tokenizer, training arguments (`TrainingArguments`), and the prepared dataset.
    ```python
    from trl import SFTTrainer
    from transformers import TrainingArguments

    trainer = SFTTrainer(
        model = model,
        tokenizer = tokenizer,
        train_dataset = dataset,
        dataset_text_field = "text",
        max_seq_length = max_seq_length,
        dataset_num_proc = 2,
        packing = False, # Can make training 5x faster for short sequences.
        args = TrainingArguments(
            per_device_train_batch_size = 2,
            gradient_accumulation_steps = 4,
            # ... other arguments
        ),
    )
    ```

**5. Start Training and Evaluation:**
*   Finally, initiate the training job by calling `trainer.train()`.
*   During and after training, Unsloth Studio's 'Compare Mode' or 'Model Arena' can be used to evaluate the fine-tuned model's performance against the original base model by comparing their outputs side-by-side.

Unsloth's documentation provides specific, complete code examples for various models, including a `bf16` LoRA example for MoE models and a vision LoRA example, which follow this general structure.

# Model Evaluation Guidance

Unsloth provides multiple methods for evaluating a fine-tuned model, both during and after the training process. During training, Unsloth Studio offers real-time observability, allowing users to monitor key metrics like training loss and GPU usage live. This helps in identifying issues such as overfitting, indicated by a rising evaluation loss, which can be addressed with early stopping. After training, Unsloth Studio features a 'Model Arena' (also referred to as 'Compare Mode'). This tool facilitates qualitative evaluation by enabling a side-by-side comparison of the fine-tuned model's outputs against the original base model. This is particularly useful for assessing improvements on a curated evaluation set, checking for desired behaviors like safety, empathy, and accuracy, as well as ensuring the model refuses to answer out-of-scope or harmful prompts. The Unsloth documentation also provides official benchmarks that demonstrate the performance and efficiency gains in areas like context length compared to standard frameworks.

# Model Export Formats

## Merged Model Export

Unsloth Studio allows users to export a 'Merged Model'. This process combines the original base model (e.g., Gemma-4) with the fine-tuned LoRA adapter weights into a single, unified model. The output is typically a 16-bit safetensors file. This format is convenient for deployment scenarios where you want a self-contained model that doesn't require loading the base and adapter separately, simplifying inference pipelines, especially in environments that use Transformers but not the PEFT library for dynamic adapter loading.

## Lora Only Export

Users can choose to export only the 'LoRA-only adapters'. This option saves just the lightweight adapter weights that were trained, resulting in a very small file. This is highly efficient for storage and sharing. To use these adapters for inference, the original base model must be loaded first, and then the LoRA adapter weights are applied on top of it. This approach is flexible, allowing for dynamic swapping of different adapters with the same base model, which is useful for experimentation or serving multiple fine-tuned tasks from a single base model instance.

## Gguf Export

Unsloth provides an export option to the GGUF format. This format is specifically optimized for efficient, local inference on both CPUs and GPUs. GGUF models are widely used by popular inference tools such as llama.cpp, Ollama, LM Studio, and even Unsloth Studio itself for running models. Exporting to GGUF is the recommended path for creating offline-first applications, running models on consumer hardware with limited VRAM, or deploying to edge devices. The documentation provides specific commands for running exported Gemma-4 GGUF models with llama-server.


# Project Plan Title

Project Plan: Fine-Tuning Gemma 4 for a Clinical Urge Surfing Web App

# Project Fine Tuning Strategy

The recommended strategy for fine-tuning the Gemma 4 E2B-it model for the clinical urge surfing app is a multi-step, privacy-centric process leveraging Unsloth Studio's capabilities.

1.  **Model Selection**: Begin with `Gemma-4-E2B-it` due to its small footprint, making it ideal for on-device or local deployment. If higher quality is needed and hardware permits (approx. 17GB VRAM for training), consider `Gemma-4-E4B`.

2.  **Dataset Curation and Preparation**:
    *   **Content**: Author a high-quality, curated dataset of clinical dialogues based on Cognitive Behavioral Therapy (CBT) and Dialectical Behavior Therapy (DBT) principles. The dialogues should focus specifically on 'urge surfing' techniques: identifying urges, labeling emotions, practicing mindfulness, and navigating cravings without acting on them. Crucially, the dataset must not contain any Protected Health Information (PHI).
    *   **Format**: Structure the data using standard chat roles (`system`, `user`, `assistant`). For safety and simplicity, train the model on a 'final answer only' format, avoiding the inclusion of the model's internal 'chain-of-thought' in the training data.
    *   **Tooling**: Utilize Unsloth Studio's 'Data Recipes' feature to process, clean, and synthesize the question-and-answer pairs from source documents (like PDFs or CSVs) into a standardized JSONL format suitable for fine-tuning.

3.  **Fine-Tuning Process (using Unsloth)**:
    *   **Method**: Employ QLoRA (4-bit quantization) to minimize VRAM usage, which is suitable for training the E2B model on consumer-grade GPUs (8-10GB VRAM). If more VRAM is available, 16-bit LoRA can be used for potentially higher accuracy.
    *   **Hyperparameters**: Start with a learning rate of `1e-4` to `2e-4`, a rank (`r`) of 8, and `lora_alpha` of 8. Set `lora_dropout` to 0.1 to prevent overfitting. Train for 1-2 epochs. Use a small `per_device_batch_size` (e.g., 1 or 2) with a higher `gradient_accumulation_steps` to achieve an effective batch size of 32, which helps stabilize training without requiring large amounts of VRAM. Enable Unsloth's optimized gradient checkpointing (`gradient_checkpointing="unsloth"`).
    *   **Target Modules**: For best results, target all attention and MLP layers by setting `target_modules` to `["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"]`.

4.  **Evaluation**: Within Unsloth Studio, use the 'Model Arena' or 'Compare Mode' to perform side-by-side comparisons of the fine-tuned model against the base `Gemma-4-E2B-it`. Evaluate responses on a curated set of prompts designed to test for safety (e.g., refusal on self-harm topics), empathy, clinical accuracy of the urge surfing guidance, and its ability to stay within scope. Monitor the evaluation loss and use early stopping to prevent overfitting.

# Nextjs Offline Demo Implementation Guide

## Engine Option Transformers Js

For a pure web-based, client-side inference solution, you can use the Transformers.js library with WebGPU. This approach involves bundling a quantized version of the fine-tuned model directly with your Next.js application. The key consideration is that applying LoRA adapters in the browser is not well-supported; therefore, you must first export a *merged* model (base model with LoRA weights combined) from Unsloth Studio in safetensors format. To enable offline functionality, a service worker should be implemented to cache the model files, allowing the Progressive Web App (PWA) to load and run the model even without an internet connection. This method is most feasible for the smallest models, like a heavily quantized Gemma-4-E2B, as the entire model must be downloaded by the user's browser.

## Engine Option Llama Cpp Wasm

This is presented as the most straightforward and privacy-preserving method for an offline demo. The workflow involves exporting the fine-tuned model from Unsloth Studio into the GGUF format, which is specifically designed for the llama.cpp ecosystem. You would then run the `llama-server` (a component of llama.cpp) locally on the user's machine. This server loads the GGUF file and exposes an OpenAI-compatible API endpoint (e.g., at `localhost:8001`). Your Next.js application, running in the user's browser, simply makes `fetch` requests to this local server to get model responses. This architecture ensures the application runs fully offline and that all data, including potentially sensitive user inputs, remains on the local machine.

## Model Loading Workflow

The model loading process depends on the chosen deployment engine.
1. **For GGUF / llama.cpp**: After fine-tuning in Unsloth Studio, select the option to export the model to GGUF. You can choose various quantization levels to balance performance and file size. This GGUF file is then loaded by the `llama-server` executable using a command-line argument pointing to the model path. The Next.js app itself does not load the model; it only communicates with the server that has loaded it.
2. **For Transformers.js**: Export the model as 'Merged 16-bit safetensors' from Unsloth Studio. This combines the base Gemma 4 model with your LoRA adapter into a single set of weights. This safetensors file is then included in the `public` directory of your Next.js project. Within your application code, you use the Transformers.js library to load the model from its URL. To make it work offline, you must configure a service worker to intercept this request and cache the model file for future sessions.
3. **For a Node.js Server**: If you need to dynamically swap LoRA adapters, you would load the base Gemma 4 model using the `transformers` library and then apply the exported LoRA-only adapter using the `peft` library at runtime. This happens within a separate Node.js server process, not the Next.js app directly.

## Ui Integration Summary

To connect the inference engine to the Next.js UI, you will create an interactive chat interface with components for user input and displaying conversation history. The core integration happens in the function that handles form submission. When the user sends a message, your Next.js component will make an asynchronous API call.
- If using the `llama-server` or a custom Node.js server, this will be a `fetch` request to the local HTTP endpoint (e.g., `POST http://localhost:8001/v1/chat/completions`) with the user's prompt in the request body.
- If using Transformers.js client-side, you will call the inference pipeline function directly within your JavaScript code.
In both cases, you will `await` the response from the model. Once the generated text is received, you update the application's state with the new message, which causes React to re-render the UI and display the assistant's reply in the chat window.


# Practical Recommendations Summary

*   **Model Selection**: Start with the `Gemma-4-E2B-it` model. Its small size is the best choice for achieving the project's goal of an offline, on-device web application.
*   **Dataset is Key**: Curate a high-quality, privacy-first dataset using clinical CBT/DBT principles for urge surfing. Use Unsloth's 'Data Recipes' feature to streamline the creation and cleaning of this dataset. Do not use any real patient data.
*   **Efficient Fine-Tuning**: Use QLoRA for memory-efficient training, especially if working with consumer GPUs (8-16GB VRAM). Target both attention and MLP layers for better accuracy and use Unsloth's specific optimizations like `gradient_checkpointing="unsloth"`.
*   **Rigorous Evaluation**: Before deploying, thoroughly evaluate the fine-tuned model in Unsloth Studio's 'Model Arena'. Test specifically for safety, empathy, clinical relevance, and the model's ability to refuse out-of-scope or harmful requests.
*   **Deployment Strategy**: For the Next.js offline demo, prioritize the GGUF export option. Running the model with `llama.cpp`'s local server is the most direct path to a fully offline, private application.
*   **Implement Safety Guardrails**: Design and implement strict safety protocols. This includes using prompts or a simple classifier to detect crisis situations and redirect the user to appropriate resources. Ensure the model is instructed not to provide diagnoses or emergency advice.
*   **Export for Flexibility**: Export your fine-tuned model in multiple formats from Unsloth Studio: LoRA-only adapters for further experimentation, merged safetensors for web deployment, and GGUF for llama.cpp. This maintains maximum flexibility for future use cases.
*   **Plan for Hardware**: Acknowledge the hardware requirements. For local training of Gemma-4-E2B, a GPU with 8-10GB of VRAM is necessary. If this is not available, plan to use a cloud GPU service like Vast.ai, which offers a pre-configured Unsloth Studio template.
