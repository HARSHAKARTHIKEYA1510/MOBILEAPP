import { useRef, useState } from 'react';
import { type TextInputInstance } from 'react-native';
import { AuthError, AuthField, AuthLayout, AuthSubmitButton } from './AuthLayout';

type Props = {
  onSignup: (username: string, password: string, bio?: string) => Promise<void>;
  onSwitchToLogin: () => void;
};

export function SignupScreen({ onSignup, onSwitchToLogin }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [bio, setBio] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const passwordRef = useRef<TextInputInstance>(null);
  const confirmRef = useRef<TextInputInstance>(null);
  const bioRef = useRef<TextInputInstance>(null);

  const trimmedUsername = username.trim();
  const canSubmit = !!trimmedUsername && !!password && !!confirmPassword && !loading;

  const submit = async () => {
    if (!canSubmit) return;
    if (trimmedUsername.length < 2) {
      setError('Username must be at least 2 characters');
      return;
    }
    if (trimmedUsername.includes(':')) {
      setError('Username cannot contain ":"');
      return;
    }
    if (password.length < 4) {
      setError('Password must be at least 4 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await onSignup(trimmedUsername, password, bio.trim() || undefined);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Sign up failed');
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Create your Nova ID"
      subtitle="Join the modern chat experience with ultra-fast sync and privacy."
      footerPrompt="Already have a Nova account?"
      footerAction="Sign in"
      onFooterPress={onSwitchToLogin}
      disabled={loading}>
      <AuthField
        label="Username"
        icon="person-outline"
        placeholder="Choose your handle (e.g. alex)"
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
        placeholder="At least 4 characters"
        textContentType="newPassword"
        returnKeyType="next"
        editable={!loading}
        value={password}
        onChangeText={setPassword}
        onSubmitEditing={() => confirmRef.current?.focus()}
      />
      <AuthField
        label="Confirm password"
        icon="shield-checkmark-outline"
        inputRef={confirmRef}
        isPassword
        placeholder="Re-enter password"
        textContentType="newPassword"
        returnKeyType="next"
        editable={!loading}
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        onSubmitEditing={() => bioRef.current?.focus()}
      />
      <AuthField
        label="Status & Bio"
        icon="sparkles-outline"
        inputRef={bioRef}
        optional
        autoCapitalize="sentences"
        placeholder="e.g. Product designer, coffee lover"
        returnKeyType="go"
        editable={!loading}
        value={bio}
        onChangeText={setBio}
        onSubmitEditing={submit}
      />
      <AuthError message={error} />
      <AuthSubmitButton label="Launch into Nova" loading={loading} disabled={!canSubmit} onPress={submit} />
    </AuthLayout>
  );
}
