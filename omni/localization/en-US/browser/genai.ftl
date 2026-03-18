

genai-settings-chat-chatgpt-links = By choosing ChatGPT, you agree to the OpenAI <a data-l10n-name="link1">Terms of Use</a> and <a data-l10n-name="link2">Privacy Policy</a>.
genai-settings-chat-claude-links = By choosing Anthropic Claude, you agree to the Anthropic <a data-l10n-name="link1">Consumer Terms of Service</a>, <a data-l10n-name="link2">Usage Policy</a>, and <a data-l10n-name="link3">Privacy Policy</a>.
genai-settings-chat-copilot-links = By choosing Copilot, you agree to the <a data-l10n-name="link1">Copilot AI Experiences Terms</a> and <a data-l10n-name="link2">Microsoft Privacy Statement</a>.
genai-settings-chat-gemini-links = By choosing Google Gemini, you agree to the <a data-l10n-name="link1">Google Terms of Service</a>, <a data-l10n-name="link2">Generative AI Prohibited Use Policy</a>, and <a data-l10n-name="link3">Gemini Apps Privacy Notice</a>.
genai-settings-chat-huggingchat-links = By choosing HuggingChat, you agree to the <a data-l10n-name="link1">HuggingChat Privacy Notice</a> and <a data-l10n-name="link2">Hugging Face Privacy Policy</a>.
genai-settings-chat-lechat-links = By choosing Le Chat Mistral, you agree to the Mistral AI <a data-l10n-name="link1">Terms of Service</a> and <a data-l10n-name="link2">Privacy Policy</a>.
genai-settings-chat-localhost-links = Bring your own private local chatbot such as <a data-l10n-name="link1">llamafile</a> from { -vendor-short-name }’s Innovation group.


genai-prompt-prefix-selection = I’m on page “{ $tabTitle }” with “{ $selection }” selected.

genai-prompts-summarize =
    .label = Summarize
    .value = Please summarize the selection using precise and concise language. Use headers and bulleted lists in the summary, to make it scannable. Maintain the meaning and factual accuracy.
genai-prompts-simplify =
    .label = Simplify language
    .value = Please rewrite the selection using short sentences and simple words. Maintain the meaning and factual accuracy.
genai-prompts-quiz =
    .label = Quiz me
    .value = Please quiz me on this selection. Ask me a variety of types of questions, for example multiple choice, true or false, and short answer. Wait for my response before moving on to the next question.
genai-prompts-explain =
    .label = Explain this
    .value = Please explain the key concepts in this selection, using simple words. Also, use examples.
genai-prompts-proofread =
    .label = Proofread
    .value = Please proofread the selection for spelling and grammar errors. Identify any mistakes and provide a corrected version of the text. Maintain the meaning and factual accuracy and output the list of proposed corrections first, followed by the final, corrected version of the text.


genai-menu-ask-generic =
    .label = Ask AI chatbot
genai-menu-ask-provider =
    .label = Ask { $provider }
genai-menu-remove-generic =
    .label = Remove AI chatbot
genai-menu-remove-provider =
    .label = Remove { $provider }

genai-input-ask-generic =
    .placeholder = Ask AI chatbot…
genai-input-ask-provider =
    .placeholder = Ask { $provider }…

genai-shortcuts-selected-warning-generic =
    .heading = AI chatbot won’t get your full selection
    .message = { $selectionLength ->
        *[other] You’ve selected about { $selectionLength } characters. The number of characters we can send to the AI chatbot is about { $maxLength }.
    }
genai-shortcuts-selected-warning =
    .heading = { $provider } won’t get your full selection
    .message = { $selectionLength ->
        *[other] You’ve selected about { $selectionLength } characters. The number of characters we can send to { $provider } is about { $maxLength }.
    }
genai-shortcuts-hide =
    .label = Hide chatbot shortcut


genai-chatbot-title = AI chatbot
genai-header-provider-menu =
    .title = Choose a chatbot
genai-header-options-button =
    .title = Open menu
genai-header-close-button =
    .title = Close

genai-provider-view-details =
    .label = View chatbot details
genai-options-reload-generic =
    .label = Reload AI chatbot
genai-options-reload-provider =
    .label = Reload { $provider }
genai-options-show-shortcut =
    .label = Show shortcut when selecting text
genai-options-hide-shortcut =
    .label = Hide shortcut when selecting text
genai-options-about-chatbot =
    .label = About AI chatbots in { -brand-short-name }


genai-chatbot-contextual-title = Use an AI chatbot without switching tabs
genai-chatbot-contextual-subtitle = Chat and browse side-by-side when you add an AI chatbot in the { -brand-short-name } sidebar.
genai-chatbot-contextual-button = Choose a chatbot

genai-onboarding-header = Summarize, brainstorm, and more as you browse
genai-onboarding-choose-header = Choose an AI chatbot to use in the { -brand-short-name } sidebar
genai-onboarding-description = Choose an AI chatbot to use in the { -brand-short-name } sidebar. We’ll show details about each chatbot when you select it. Switch anytime. <a data-l10n-name="learn-more">Learn more</a>
genai-onboarding-choose-description = Switch anytime. For help choosing, <a data-l10n-name="learn-more">learn more about each chatbot</a>.
genai-onboarding-primary = Continue
genai-onboarding-secondary = Close
genai-onboarding-claude-tooltip =
    .title = Anthropic Claude
genai-onboarding-claude-learn = Learn more about Claude
genai-onboarding-chatgpt-tooltip =
    .title = ChatGPT
genai-onboarding-chatgpt-learn = Learn more about ChatGPT
genai-onboarding-copilot-tooltip =
    .title = Copilot
genai-onboarding-copilot-learn = Learn more about Copilot
genai-onboarding-gemini-tooltip =
    .title = Google Gemini
genai-onboarding-gemini-learn = Learn more about Gemini
genai-onboarding-huggingchat-tooltip =
    .title = HuggingChat
genai-onboarding-huggingchat-learn = Learn more about HuggingChat
genai-onboarding-lechat-tooltip =
    .title = Le Chat Mistral
genai-onboarding-lechat-learn = Learn more about Le Chat

genai-onboarding-select-header = Select text to see suggestions
genai-onboarding-select-description = When you select text, we’ll suggest prompts you can send to the chatbot. You can also write in your own prompts.
genai-onboarding-select-primary = Start chatting


genai-onboarding-claude-generate = Generate text and code
genai-onboarding-claude-analyze = Analyze documents and images
genai-onboarding-claude-price = Free and paid options; account required
genai-onboarding-chatgpt-generate = Generate text, images, and code
genai-onboarding-chatgpt-analyze = Analyze documents and images
genai-onboarding-chatgpt-price = Free and paid options; account required for some countries and tasks
genai-onboarding-copilot-generate = Generate text, images, and code
genai-onboarding-copilot-analyze = Analyze images
genai-onboarding-copilot-price = Free and paid options; account required for some tasks
genai-onboarding-gemini-generate = Generate text, images, and code
genai-onboarding-gemini-analyze = Analyze images (free) and documents (paid)
genai-onboarding-gemini-price = Free and paid options; account required
genai-onboarding-huggingchat-generate = Generate text and code
genai-onboarding-huggingchat-switch = Switch between a diverse set of open models
genai-onboarding-huggingchat-price-2 = Free; account required after a certain number of requests
genai-onboarding-lechat-generate = Generate text and code
genai-onboarding-lechat-price = Free; account required


genai-model-optin-continue =
  .label = Continue

genai-model-optin-optout =
  .label = Cancel

genai-model-optin-cancel =
  .label = Cancel


link-preview-reading-time =
    { $rangePlural ->
        [one] { $range } min reading time
       *[other] { $range } mins reading time
    }
