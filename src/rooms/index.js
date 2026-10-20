// Room registry. Each room id in business.config.js "rooms" needs a 3D builder here.
// To add a bathroom or an exterior later: write src/rooms/bathroom.js exporting a builder with the same shape
// ({ root, partObjects, applyLooks, setNight, views }) and register it below.
import { buildKitchen } from './kitchen.js';

export const builders = {
  kitchen: buildKitchen,
};
