import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ConversationsScreen from '../screens/chat/ConversationsScreen';
import ChatRoomScreen from '../screens/chat/ChatRoomScreen';

const Stack = createNativeStackNavigator();

export default function ChatStack() {
  return (
    <Stack.Navigator
      initialRouteName="Conversations"
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="Conversations" component={ConversationsScreen} />
      <Stack.Screen name="ChatRoom" component={ChatRoomScreen} />
    </Stack.Navigator>
  );
}

