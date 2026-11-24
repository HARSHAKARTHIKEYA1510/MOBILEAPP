import { useRef, useState } from 'react';
import { type TextInputInstance } from 'react-native';
import { AuthError, AuthField, AuthLayout, AuthSubmitButton } from './AuthLayout';

type Props = {
  onLogin: (username: string, password: string) => Promise<void>;
  onSwitchToSignup: () => void;
};

export function LoginScreen({ onLogin, onSwitchToSignup }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const passwordRef = useRef<TextInputInstance>(null);

  const canSubmit = !!username.trim() && !!password && !loading;

  const submit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError('');
    try {
      await onLogin(username.trim(), password);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Sign in failed');
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Welcome to Nova"
      subtitle="Sign in to your account to access your conversations and updates."
      footerPrompt="Don't have a Nova account?"
      footerAction="Get started"
      onFooterPress={onSwitchToSignup}
      disabled={loading}>
      <AuthField
        label="Username"
        icon="person-outline"
        placeholder="Enter your username"
        textContentType="username"
        returnKeyType="next"
        editable={!loading}
        value={username}
        onChangeText={setUsername}
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <AuthField
        label="Password"
        icon="lock-closed-outline"
        inputRef={passwordRef}
        isPassword
        placeholder="Enter your password"
        textContentType="password"
        returnKeyType="go"
        editable={!loading}
        value={password}
        onChangeText={setPassword}
        onSubmitEditing={submit}
      />
      <AuthError message={error} />
      <AuthSubmitButton label="Sign In to Nova" loading={loading} disabled={!canSubmit} onPress={submit} />
    </AuthLayout>
  );
}
