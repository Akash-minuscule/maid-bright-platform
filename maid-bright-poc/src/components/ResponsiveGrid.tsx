import React, { Children } from 'react';
import { View } from 'react-native';
import { useResponsive } from '../hooks/useResponsive';
export function ResponsiveGrid({
  children,
  singleColumn = false,
  testID,
}: React.PropsWithChildren<{ singleColumn?: boolean; testID?: string }>) {
  const { columns } = useResponsive();
  const multiple = !singleColumn && columns > 1;
  return (
    <View testID={testID} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 18 }}>
      {Children.toArray(children).map((child, index) => (
        <View
          key={(React.isValidElement(child) && child.key) || index}
          style={{ flexBasis: multiple ? '46%' : '100%', flexGrow: 1, minWidth: 0 }}
        >
          {child}
        </View>
      ))}
    </View>
  );
}
