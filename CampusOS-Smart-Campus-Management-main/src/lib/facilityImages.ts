import campusHeroQuad from '../assets/images/campus_hero_quad_1794510143997.jpg';
import facilityLectureHall from '../assets/images/facility_lecture_hall_1794510143208.jpg';
import facilityComputerLab from '../assets/images/facility_computer_lab_1794510143698.jpg';
import facilityAuditorium from '../assets/images/facility_auditorium_1794510144055.jpg';
import facilitySportsComplex from '../assets/images/facility_sports_complex_1794510145586.jpg';

export const CAMPUS_HERO_IMAGE = campusHeroQuad;

export const FACILITY_IMAGES: Record<string, string> = {
  lecture_hall: facilityLectureHall,
  computer_lab: facilityComputerLab,
  auditorium: facilityAuditorium,
  sports_complex: facilitySportsComplex,
};

export function getFacilityImage(imageKey?: string | null): string {
  if (imageKey && FACILITY_IMAGES[imageKey]) {
    return FACILITY_IMAGES[imageKey];
  }
  return facilityLectureHall;
}
