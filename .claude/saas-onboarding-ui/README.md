# SaaS Onboarding UI

Welcome to the SaaS Onboarding UI project! This project is designed to provide a modern and elegant onboarding experience for an HR management platform, utilizing React and Tailwind CSS. The design is inspired by clean aesthetics from platforms like Linear, Stripe, and Notion.

## Project Structure

```
saas-onboarding-ui
├── public
│   └── index.html          # Main HTML document for the application
├── src
│   ├── components          # Contains reusable components for the onboarding UI
│   │   ├── FeatureCard.tsx # Component for displaying feature cards
│   │   ├── HeroIllustration.tsx # Component for hero illustration
│   │   ├── OnboardingPanel.tsx # Main onboarding panel component
│   │   ├── SignupForm.tsx  # Component for signup/login form
│   │   └── SplitScreenLayout.tsx # Component for split-screen layout
│   ├── styles              # Contains global and Tailwind CSS styles
│   │   ├── globals.css     # Global CSS styles
│   │   └── tailwind.css    # Tailwind CSS styles
│   ├── App.tsx             # Main application component
│   ├── main.tsx            # Entry point of the React application
│   └── types.ts            # TypeScript types and interfaces
├── package.json            # npm configuration file
├── postcss.config.js       # PostCSS configuration for processing CSS
├── tailwind.config.js      # Tailwind CSS configuration
├── tsconfig.json           # TypeScript configuration
└── README.md               # Project documentation
```

## Getting Started

To get started with the project, follow these steps:

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd saas-onboarding-ui
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Run the application:**
   ```bash
   npm start
   ```

4. **Open your browser:**
   Navigate to `http://localhost:3000` to view the application.

## Features

- **Split-Screen Layout:** A modern split-screen design that enhances user experience.
- **Elegant Typography:** Clean and readable typography for better engagement.
- **Responsive Design:** The UI is fully responsive and works on various screen sizes.
- **Customizable:** Tailwind CSS allows for easy customization of styles.

## Contributing

Contributions are welcome! If you have suggestions for improvements or new features, please open an issue or submit a pull request.

## License

This project is licensed under the MIT License. See the LICENSE file for more details.