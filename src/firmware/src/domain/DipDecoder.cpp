#include "domain/DipDecoder.hpp"

namespace micromouse::domain {

MazeSetup DipDecoder::decode(bool /*dip1*/, bool /*dip2*/, bool /*dip3*/) const {
    return {
        MazeType::Small4x4,  //
        4,                   //
        4,                   //
        Position{3, 0},      //
        Position{0, 3}       //
    };
}

}  // namespace micromouse::domain
