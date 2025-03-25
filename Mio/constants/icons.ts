import { ImageSourcePropType } from 'react-native';

// Use direct relative paths instead of aliases
import home from '../assets/icons/home.png';
import inbox from '../assets/icons/inbox.png';
import profile from '../assets/icons/profile.png';
import matched from '../assets/icons/match.png';
import eye from '../assets/icons/eye.png';

interface Icons {
  home: ImageSourcePropType;
  inbox: ImageSourcePropType;
  profile: ImageSourcePropType;
  matched: ImageSourcePropType;
  eye: ImageSourcePropType;
}

const icons: Icons = {
  home,
  inbox,
  profile,
  matched,
  eye,
};

export default icons;
