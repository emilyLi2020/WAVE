# Executive Summary

The current landscape for runtime LoRA adapter swapping for Gemma models on-device and in-browser shows a clear division between native/server-side and web-based environments. True in-browser hot-swapping is not yet supported by key frameworks like Transformers.js or its underlying ONNX Runtime Web backend; a feature request for this capability is currently open. Consequently, a pure browser-based application must simulate adapter swapping by loading separate, pre-fused models for each LoRA variant, which involves higher latency and memory usage.

In contrast, native and server-side solutions offer mature support for hot-swapping. Llama.cpp provides a robust server implementation that can load multiple adapters and switch between them at runtime via an HTTP API. Similarly, the native ONNX Runtime GenAI library supports loading multiple adapters and activating them on-demand without reloading the base model. For on-device mobile use cases, Google's MediaPipe LLM Inference API offers experimental LoRA support for Gemma on GPU, but it is currently limited to static loading at initialization time on Android. Meta's ExecuTorch presents a more flexible architecture with its program-data separation, which is designed to allow multiple LoRA adapters to be loaded and switched at runtime while sharing base model weights. For a Next.js browser demo requiring adapter swapping, the most practical architecture is to have the browser UI communicate with a local or remote server running a capable engine like llama.cpp or ONNX Runtime GenAI. A pure-browser alternative would involve pre-merging each LoRA with the base Gemma model into separate ONNX files and loading them individually upon user selection.

# Technology Options Overview

## Technology Name

Transformers.js

## Primary Use Case

In-browser

## Hot Swapping Support

None

## Supported Artifact Formats

The framework consumes ONNX model artifacts, which are typically exported from Hugging Face models using the Optimum library. There is no documented format for LoRA adapters to be used in the browser.

## Adapter Management Api

The standard API consists of `pipeline` and model loading functions. There is no documented API for loading, applying, or swapping LoRA adapters at runtime in the browser.

## Key Limitations

The primary limitation is the complete lack of support for LoRA adapter loading or swapping in the browser. This is a direct consequence of its dependency, ONNX Runtime Web, not supporting this feature. All models must be converted to ONNX format, and WebGPU acceleration is dependent on browser and hardware support.

## Technology Name

ONNX Runtime Web

## Primary Use Case

In-browser

## Hot Swapping Support

None

## Supported Artifact Formats

Consumes ONNX models for inference. It does not support the `.onnx_adapter` format used by its native counterpart, ONNX Runtime GenAI.

## Adapter Management Api

None. While the native C++ and Python ONNX Runtime GenAI libraries have APIs like `set_active_adapter` for hot-swapping, these are not available in the ONNX Runtime Web build.

## Key Limitations

The absence of LoRA adapter support is the key limitation. A feature request to add this capability is open on GitHub, but it is not currently implemented, which prevents frameworks like Transformers.js from offering in-browser hot-swapping.

## Technology Name

Google AI Edge (MediaPipe LLM Inference)

## Primary Use Case

On-mobile (Android/iOS) and Web

## Hot Swapping Support

Partial

## Supported Artifact Formats

Requires two TFLite flatbuffer files: one for the base model and a separate one for the LoRA adapter. These are generated from a standard `adapter_model.safetensors` file using a dedicated MediaPipe converter.

## Adapter Management Api

On Android, LoRA is supported statically during initialization using `LlmInference.Options.Builder().setLoraPath('<path to LoRA model>')`. There is no documented API for dynamically swapping adapters at runtime after the inference engine has been initialized.

## Key Limitations

LoRA support is experimental and has several constraints: it is only available for the GPU backend, applies only to attention layers, and is not supported for some models like Gemma-3 1B. The most significant limitation is the lack of a documented runtime hot-swapping feature; adapters must be chosen at initialization.

## Technology Name

llama.cpp

## Primary Use Case

Server-side / Native Application

## Hot Swapping Support

Full

## Supported Artifact Formats

The base model must be in GGUF format. LoRA adapters are loaded from separate files in a llama.cpp-supported format.

## Adapter Management Api

Provides both command-line flags and an HTTP API for adapter management. The `--lora` flag can load multiple adapters at startup. The `--lora-init-without-apply` flag loads them without activating them, allowing the `POST /lora-adapters` HTTP endpoint to be used to apply, switch, or clear adapters dynamically at runtime.

## Key Limitations

This solution is designed for native or server-side execution, not for direct use within a browser sandbox. When loading multiple adapters, the memory overhead on the CPU/GPU can be significant, and managing concurrency for a multi-tenant server can be complex.

## Technology Name

Apple MLX

## Primary Use Case

Native Application (Apple Silicon)

## Hot Swapping Support

None

## Supported Artifact Formats

Models are stored in the MLX directory format. LoRA adapters are saved as `adapters.npz` files. The framework also supports fusing adapters into a base model to create a new, merged model directory.

## Adapter Management Api

The official examples provide Python scripts for training (`lora.py`) and merging (`fuse.py`). There is no officially documented, built-in API in the core MLX library for dynamically loading or switching between different adapters at runtime.

## Key Limitations

The primary limitation is the absence of a formal, built-in hot-swapping API. To switch between different fine-tunings, a developer would need to implement custom logic to manage adapters or resort to loading different pre-fused models. The framework is highly optimized for and primarily targets Apple Silicon hardware.

## Technology Name

ExecuTorch

## Primary Use Case

On-mobile (cross-platform)

## Hot Swapping Support

Full

## Supported Artifact Formats

Uses `.pte` (PyTorch Executable) files. The architecture separates the program from the data, allowing a single foundation weight file to be shared across multiple LoRA PTE files. Each LoRA adapter is its own `.pte` file.

## Adapter Management Api

A C++ runner API is used for execution. The official example demonstrates how to load multiple LoRA PTE files concurrently and switch between them, proving the feasibility of runtime swapping by sharing the base model weights to reduce memory.

## Key Limitations

ExecuTorch is a relatively new framework, and its maturity can vary depending on the target hardware backend. While the architecture enables hot-swapping, the developer is responsible for implementing the higher-level adapter management logic within their application using the C++ API.


# Transformers Js Analysis

Transformers.js is a JavaScript library from Hugging Face designed to run transformer models directly in a web browser, eliminating the need for a server backend. It achieves this by leveraging ONNX Runtime Web, which enables hardware acceleration through WebGPU. As detailed in the library's v3 update, enabling WebGPU is as straightforward as setting the device parameter to 'webgpu' when loading a model. The primary artifact format consumed by Transformers.js is ONNX, with models typically converted using the Hugging Face Optimum library and hosted on the Hub with a 'transformers.js' tag.

A critical limitation for dynamic, on-device applications is its current lack of support for Parameter-Efficient Fine-Tuning (PEFT) techniques like LoRA at runtime. The official documentation and related materials do not describe any API or mechanism for loading, applying, or swapping LoRA adapters to a base model within the browser. This means that true 'hot-swapping' of adapters is not a feature available in the current version of Transformers.js. To achieve a similar effect, developers must resort to workarounds, such as pre-merging each LoRA adapter with the base model offline, creating multiple distinct ONNX models, and then loading the desired full model into the browser. This approach consumes more bandwidth and memory compared to loading a single base model and small, swappable adapters.

# Onnx Runtime Web Analysis

ONNX Runtime is a cross-platform inference and training accelerator, but its features vary significantly between its native and web-based distributions. The native ONNX Runtime, specifically through its 'onnxruntime-genai' extension for C++ and Python, offers robust support for LoRA. It enables a 'Multi-LoRA' capability where multiple adapters can be loaded simultaneously for a single base model. These adapters are first converted into a specific `.onnx_adapter` format using tools like Olive. At runtime, developers can dynamically switch between these loaded adapters using the `generator.set_active_adapter()` function, which facilitates efficient hot-swapping without needing to reload the entire base model.

In stark contrast, ONNX Runtime Web, the backend that powers libraries like Transformers.js for in-browser execution, does not currently support this functionality. A feature request on the official ONNX Runtime GitHub repository explicitly tracks the need for LoRA adapter support in `onnxruntime-web`. Its current status as an open request confirms that the ability to apply and switch LoRA adapters to a base ONNX model in real-time within a browser environment is not yet available. Therefore, any application relying on ONNX Runtime Web for in-browser inference cannot perform true LoRA hot-swapping at this time.

# Mediapipe Llm Analysis

Google AI Edge's MediaPipe LLM Inference API is a framework designed for on-device large language model execution on mobile (Android/iOS) and web platforms, using TFLite as its backend. It provides documented support for LoRA customization, specifically for Gemma variants and Phi-2 models, although this feature is restricted to the GPU backend and only applies LoRA weights to the model's attention layers. A notable exception is Gemma-3 1B, which explicitly does not support LoRA configuration.

The workflow involves training a PEFT LoRA adapter, which results in an `adapter_model.safetensors` file. This file must then be processed by a dedicated MediaPipe converter, which outputs two distinct TFLite flatbuffer files: one for the base model and a separate one for the LoRA adapter. For deployment, the API's support for swapping adapters appears limited. On Android, the documentation describes a 'static LoRA' approach where the adapter is loaded during the initialization of the inference task via the `setLoraPath(...)` method in the options. The documentation does not provide any API or guidance for dynamically changing or hot-swapping this adapter at runtime after the task has been created. This implies that switching to a different LoRA adapter would require re-initializing the entire inference pipeline, which is not true hot-swapping.

# Llama Cpp Analysis

The llama.cpp project, particularly its server component, provides robust and flexible support for LoRA adapters at runtime. It is a strong candidate for scenarios requiring dynamic adapter management. The server can load a base model in the GGUF format and simultaneously load multiple LoRA adapter files using the `--lora` command-line flag. This multi-adapter capability is a key feature for serving diverse, fine-tuned model behaviors from a single base model instance.

Crucially, llama.cpp supports true hot-swapping of these adapters. This is enabled by a specific operational mode where adapters can be loaded into memory at startup but not immediately applied. By using the `--lora-init-without-apply` flag, the server starts without any adapter active. Subsequently, a client can send an HTTP request to the `POST /lora-adapters` endpoint to dynamically apply, change, or clear the active LoRA adapter(s) at runtime. This mechanism allows for instantaneous switching between different fine-tuned tasks without the latency or overhead of reloading the base model, making it a highly effective solution for production environments that need to serve multiple LoRA-based customizations.

# Mlx Analysis

Apple's MLX framework provides comprehensive support for the LoRA (Low-Rank Adaptation) workflow, including fine-tuning (LoRA and QLoRA) and generation. The standard process involves using Python scripts like `lora.py` for training, evaluation, and generation. The resulting trained adapters are saved by default in a file named `adapters.npz`. A key feature of the MLX workflow is the ability to fuse these adapters directly into the base model. This is accomplished using the `fuse.py` script, which creates a new, self-contained model directory with the adapter weights baked in. However, regarding runtime adaptability, the official MLX core libraries and examples do not document a built-in API for 'hot-swapping' adapters—that is, applying or switching between different LoRA adapters on a loaded model without re-initialization. The documented approach leans towards creating separate, pre-fused models for each adapter. Therefore, to serve different LoRA specializations, a user would typically need to either load different fused models as needed or implement custom server logic to manage adapters, as a native hot-swap function is not an officially documented feature.

# Executorch Analysis

PyTorch's ExecuTorch framework implements a highly efficient method for handling LoRA adapters through a concept known as 'program–data separation'. This architecture is demonstrated in an official example where a single, large foundation model's weights can be shared across multiple, smaller LoRA-specialized models. In this workflow, the base model and the various LoRA adapters are exported as separate `.pte` (PyTorch Edge) files. The crucial aspect is that the LoRA `.pte` files are lightweight and contain references to the shared foundation weight file rather than duplicating the weights. This design enables an application to load the base model once and then load and run multiple LoRA `.pte` files concurrently. By sharing the base weights, this approach significantly reduces runtime memory consumption, making it ideal for resource-constrained on-device deployment. The framework provides a C++ runner API to execute these models. This architecture inherently supports the dynamic switching of adapters (hot-swapping), as the application can manage which LoRA program is active at any given time without needing to reload the entire base model.

# Hot Swapping Capability Comparison

The support for 'hot-swapping' LoRA adapters at runtime varies significantly across the evaluated frameworks:

- **Supported (True Hot-Swapping):**
  - **ONNX Runtime (native GenAI):** Explicitly supports hot-swapping. It allows loading multiple adapters and switching between them at runtime using the `set_active_adapter()` function without reloading the base model.
  - **llama.cpp:** The server component provides robust hot-swapping capabilities. Multiple LoRA adapters can be loaded at startup, and they can be applied, changed, or cleared at runtime via HTTP requests to the `/lora-adapters` endpoint.
  - **ExecuTorch:** While not a single API call, its 'program–data separation' architecture is designed to enable hot-swapping. It allows multiple LoRA `.pte` programs to be loaded simultaneously, sharing the base model's weights, which makes switching between them at runtime memory-efficient and feasible.

- **Not Supported (Requires Re-initialization or Model Reload):**
  - **Transformers.js / ONNX Runtime Web:** There is currently no documented support for loading or swapping LoRA adapters in the browser. A feature request for this capability in ONNX Runtime Web is open. To change specializations, one must load an entirely new model, typically one that has been pre-fused with the desired LoRA adapter.
  - **Google AI Edge (MediaPipe LLM):** The documented support is for 'static LoRA during initialization'. On Android, for example, the LoRA path is set via `setLoraPath` when the inference task is created. The documentation does not describe a method for dynamically swapping adapters at runtime on a live model instance.
  - **MLX:** The official examples and documentation focus on training, inference with a single adapter, and fusing adapters into a new model. There is no built-in, documented API in the core framework for runtime adapter swapping. Changing adapters would require loading a different fused model or implementing custom logic.

# Artifact Format And Conversion Summary

Each framework requires specific artifact formats for the base model and its LoRA adapters, often involving a conversion step from standard training outputs like `.safetensors`.

- **Transformers.js (ONNX Runtime Web):**
  - **Base Model:** ONNX format. This is typically converted from a standard PyTorch or TensorFlow model using tools like Hugging Face Optimum.
  - **LoRA Adapter:** No adapter format is documented for the web stack. The workflow requires pre-fusing the LoRA into the base model and exporting the result as a new, complete ONNX model.

- **ONNX Runtime (native GenAI):**
  - **Base Model:** ONNX format.
  - **LoRA Adapter:** A proprietary `.onnx_adapter` format. These are generated from standard adapter files (e.g., from PEFT) using the Olive conversion tool.

- **Google AI Edge (MediaPipe LLM):**
  - **Base Model:** TFLite flatbuffer (`.tflite`).
  - **LoRA Adapter:** A separate TFLite flatbuffer (`.tflite`). The conversion process starts with a trained `adapter_model.safetensors` file, which is processed by a MediaPipe converter to produce two distinct TFLite files: one for the base model and one for the LoRA weights.

- **llama.cpp:**
  - **Base Model:** GGUF (GGML Universal Format).
  - **LoRA Adapter:** A specific LoRA file format compatible with the llama.cpp ecosystem.

- **Apple MLX:**
  - **Base Model:** MLX's native directory format.
  - **LoRA Adapter:** Saved as an `adapters.npz` file by default during training.

- **ExecuTorch:**
  - **Base Model:** A `.pte` (PyTorch Edge) program file containing the model graph and, in the program-data separation model, a reference to a separate weight file.
  - **LoRA Adapter:** A separate, lightweight `.pte` program file that references the shared foundation weight file.

# Adapter Management Api Overview

An overview of the APIs for runtime LoRA adapter management across various frameworks reveals significant differences in capability and approach:

- **Transformers.js (@huggingface/transformers)**: There is no documented API for loading or swapping LoRA adapters in the browser. The standard API revolves around creating a `pipeline` or model instance, which does not include methods for adapter manipulation at runtime.

- **ONNX Runtime GenAI (Native)**: This framework provides a robust API for true hot-swapping. Adapters are first loaded using `og.Adapters(model).load(adapterName, path)`, which prepares them for use. The active adapter can then be switched dynamically by calling `generator.set_active_adapter(adapters, adapterName)`. This allows for seamless switching without re-initializing the base model.

- **ONNX Runtime Web**: This runtime, which powers Transformers.js in the browser, currently lacks any support for LoRA adapters. A feature request exists, but as of now, no API is available for in-browser use.

- **Google AI Edge (MediaPipe LLM Inference)**: The API supports LoRA but not for dynamic runtime swapping. On Android, the API allows for specifying a LoRA model at initialization time via `setLoraPath('<path to LoRA model>')` within the task options. This is a static choice made before the model is fully loaded, not a hot-swap mechanism.

- **llama.cpp**: Management is handled through its server functionality. At startup, multiple adapters can be loaded using the `--lora` flag. The `--lora-init-without-apply` flag can be used to load them without activating any. Runtime swapping is then achieved by making HTTP requests to the server's `POST /lora-adapters` endpoint to apply or clear specific adapters.

- **MLX**: The official MLX examples and core library do not document a formal API for runtime adapter swapping. The provided scripts like `lora.py` are for training and inference with a pre-selected adapter, and `fuse.py` is for baking an adapter into a new model offline. Any hot-swapping would require custom implementation.

- **ExecuTorch**: It provides a C++ runner API that enables runtime adapter management. The framework's program-data separation model allows for loading multiple LoRA PTE files (program files) that share a single foundation weight file. The application can then switch between these loaded PTEs at runtime, effectively swapping LoRA adapters while keeping the base model weights in memory.

# Framework Limitations And Maturity

The maturity and limitations of LoRA support vary significantly across the evaluated on-device and web frameworks:

- **Transformers.js / ONNX Runtime Web**: The primary limitation is the complete absence of support for LoRA adapters in the browser via ONNX Runtime Web. This makes true in-browser hot-swapping impossible with this stack today. Any solution using Transformers.js must work around this by loading pre-merged models. The framework itself is mature for running standard ONNX models with WebGPU, but the PEFT/LoRA ecosystem has not yet been extended to it.

- **Google AI Edge (MediaPipe LLM)**: LoRA support is considered experimental. Key limitations include:
    - **Platform Constraint**: LoRA is only supported on the GPU backend.
    - **Model Constraint**: LoRA weights can only be applied to attention layers.
    - **Gemma Support**: While most Gemma variants are supported, the documentation explicitly states that **Gemma-3 1B cannot be configured to support LoRA**.
    - **Runtime Swapping**: The documented mechanism is static loading at initialization on Android (`setLoraPath`), not dynamic hot-swapping.
    - **Artifacts**: Requires a specific conversion process from `.safetensors` to a pair of TFLite flatbuffer files (base and LoRA).

- **ONNX Runtime GenAI (Native)**: This is a mature solution for hot-swapping on native platforms. It supports Multi-LoRA, allowing multiple adapters to be loaded and switched efficiently. The main limitation is that this capability is not yet available in its web counterpart, ONNX Runtime Web.

- **llama.cpp**: This framework offers mature and robust support for runtime LoRA swapping via its server mode. The primary limitations are practical: loading multiple LoRA adapters consumes significant CPU/GPU memory, and managing concurrency for a multi-tenant server can be complex.

- **Apple MLX**: MLX has strong support for training and using LoRA models. However, its maturity for serving with dynamic adapters is low, as it lacks an official, built-in API for runtime hot-swapping. The common practice is to fuse the adapter into the model, which is an offline process. Implementing a hot-swap server would require custom logic on top of the core library.

- **ExecuTorch**: This framework is designed for high-performance, low-level execution on edge devices. Its program-data separation concept is a powerful and memory-efficient way to handle multiple LoRA adapters. The main limitation is its maturity and complexity; it's a lower-level C++ framework, and the maturity of its backends can vary. It requires developers to implement the adapter management logic themselves.

# Recommended Architecture For Nextjs Demo

## Recommended Framework

@huggingface/transformers (Transformers.js)

## Base Model Strategy

The core strategy is to circumvent the lack of in-browser LoRA support by preparing models offline. For each trained LoRA adapter, a separate, fully merged model is created by fusing the adapter weights with the base Gemma model's weights. Each of these merged models is then converted to the ONNX format required by Transformers.js. These ONNX model variants are hosted on the Hugging Face Hub in individual repositories, each tagged with 'transformers.js' for discoverability. In the browser, the application will only load one of these pre-fused models at a time. To mitigate redundant downloads, the browser's Cache API and/or IndexedDB should be used to cache the model files after their first load.

## Adapter Handling Logic

Since runtime adapter application is not possible, the logic shifts from managing adapters to managing a collection of distinct model variants. A 'model registry', likely a static JSON file within the Next.js application, will map user-friendly persona names (e.g., 'Creative Writer', 'Python Coder') to their corresponding Hugging Face Hub model repository IDs. When a user selects a persona, the application looks up the associated model ID in this registry and initiates the process of loading that specific pre-fused model.

## Swapping Mechanism

The 'swapping' is not a seamless, low-level switch but a full replacement of the model pipeline. The technical process involves: 
1. **Disposal**: When the user selects a new persona, the existing Transformers.js pipeline object is completely disposed of to free up WebGPU memory and other resources. 
2. **Re-instantiation**: A new pipeline is instantiated using the `pipeline()` factory function from Transformers.js, providing the model ID of the newly selected pre-fused model and specifying `device: 'webgpu'`. 
3. **Loading**: The framework then loads the model weights. This process is significantly faster on subsequent selections of the same persona if the model files have been successfully cached in the browser.

## Ui Ux Considerations

A smooth user experience is critical due to the latency of model swapping. Key considerations include:
- **Loading States**: The UI must provide clear, non-blocking feedback during model loading. This includes progress bars or spinners and disabling interactive elements like the text input and persona selector.
- **Web Workers**: All heavy operations, including model initialization and inference, must be offloaded to a Web Worker. This prevents the main UI thread from freezing, keeping the application responsive.
- **Token Streaming**: During text generation, tokens should be streamed from the worker back to the main thread and rendered incrementally, providing immediate feedback to the user.
- **Caching Strategy**: Implement an intelligent caching strategy. Consider pre-fetching the most popular model variants in the background during idle time to reduce wait times.

## Code Structure Overview

A high-level code structure within the Next.js application would look like this:
- **State Management**: Use React hooks (`useState`, `useContext`, or `useReducer`) or a lightweight state management library to manage global state, such as the currently active model ID, loading status, and chat history.
- **Components**: 
  - `PersonaSelector.js`: A dropdown or button group for the user to choose a model persona.
  - `ChatInterface.js`: The main component containing the message display and text input.
- **Web Worker (`inference-worker.js`)**: A dedicated worker script to handle all Transformers.js logic. It will listen for messages like `{ type: 'LOAD_MODEL', modelId: '...' }` or `{ type: 'GENERATE', text: '...' }` and post messages back with progress and results.
- **Model Manager Hook (`useInference.js`)**: A custom React hook that acts as the bridge between the UI components and the Web Worker. It will manage the worker's lifecycle and provide a simple API to the components (e.g., `loadModel(modelId)`, `generate(text)`).

