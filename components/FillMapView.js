// A MapView that fills its parent. On iOS (new architecture) react-native-maps
// gets height 0 from absoluteFill / flex:1, so we measure the parent and give
// the map explicit pixel dimensions instead.
import React, { forwardRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import MapView from 'react-native-maps';

const FillMapView = forwardRef(function FillMapView({ style, children, ...props }, ref) {
  const [size, setSize] = useState(null);
  return (
    <View
      style={[StyleSheet.absoluteFill, style]}
      onLayout={e => {
        const { width, height } = e.nativeEvent.layout;
        if (!size || size.width !== width || size.height !== height) setSize({ width, height });
      }}
    >
      {size && size.height > 0 ? (
        <MapView ref={ref} style={{ width: size.width, height: size.height }} {...props}>
          {children}
        </MapView>
      ) : null}
    </View>
  );
});

export default FillMapView;
