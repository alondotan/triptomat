export function categoryEmoji(category: string): string {
  switch (category) {
    case 'accommodation': return '🏨';
    case 'eatery':        return '🍽️';
    case 'attraction':    return '🏛️';
    case 'service':       return '🔧';
    default:              return '📍';
  }
}

export function transportEmoji(category: string): string {
  switch (category) {
    case 'flight':      return '✈️';
    case 'train':       return '🚂';
    case 'ferry':       return '⛴️';
    case 'bus':         return '🚌';
    case 'taxi':        return '🚕';
    case 'car_rental':  return '🚗';
    default:            return '🚀';
  }
}
