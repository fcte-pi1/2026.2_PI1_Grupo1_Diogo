#include "domain/DipDecoder.hpp"

#include <stdexcept>

namespace micromouse::domain {

namespace {

struct Dimensions {
    MazeType type;
    int rows;
    int columns;
};

Dimensions decodeType(bool dip1, bool dip2) {
    const int code = (dip2 ? 2 : 0) + (dip1 ? 1 : 0);

    switch (code) {
        case 0:
            return {MazeType::Small4x4, 4, 4};
        case 1:
            return {MazeType::Medium8x4, 4, 8};
        case 2:
            return {MazeType::Large12x4, 4, 12};
        case 3:
            throw std::invalid_argument("DipDecoder: Reserved combination of dip1 and dip2");
    }

    __builtin_unreachable();
}

}  // namespace

MazeSetup DipDecoder::decode(bool dip1, bool dip2, bool dip3) const {
    const Dimensions dimensions = decodeType(dip1, dip2);
    const Position start{dimensions.rows - 1, dip3 ? dimensions.columns - 1 : 0};
    const Position goal{dimensions.rows - 1 - start.row, dimensions.columns - 1 - start.column};
    return {
        dimensions.type,     //
        dimensions.rows,     //
        dimensions.columns,  //
        start,               //
        goal                 //
    };
}

}  // namespace micromouse::domain
